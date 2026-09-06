import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import {PrismaService, TxClient} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {AccountShareEntity} from "./models/entities/account-share.entity";
import {AccountSharePermission} from "../../../../prisma/generated/enums";

@Injectable()
export class AccountShareService {
    private readonly logger = new Logger(AccountShareService.name);

    constructor(private readonly prismaService: PrismaService) {}

    async listShares(user: UserEntity, accountId: string): Promise<AccountShareEntity[]> {
        await this.assertOwner(user, accountId);
        const shares = await this.prismaService.accountShares.findMany({
            where: {account_id: accountId},
            include: {shared_with: true},
            orderBy: {created_at: "asc"},
        });
        return shares.map((share) => this.toEntity(share));
    }

    async shareAccount(
        user: UserEntity,
        accountId: string,
        memberId: string,
        permission: AccountSharePermission,
    ): Promise<AccountShareEntity> {
        const account = await this.assertOwner(user, accountId);

        if (memberId === user.id) {
            throw new BadRequestException("You cannot share an account with yourself");
        }

        const member = await this.prismaService.users.findUnique({
            where: {id: memberId},
            select: {id: true, family_id: true, username: true, email: true},
        });
        if (!member) throw new NotFoundException("Member not found");

        if (!user.familyId || member.family_id !== user.familyId) {
            throw new ForbiddenException("Member must belong to the same family");
        }

        try {
            const share = await this.prismaService.accountShares.create({
                data: {
                    account_id: account.id,
                    shared_with_id: memberId,
                    permission,
                },
                include: {shared_with: true},
            });
            this.logger.log(`Account ${accountId} shared with user ${memberId} (${permission})`);
            return this.toEntity(share);
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && (error as {code: string}).code === "P2002") {
                throw new ConflictException("Account is already shared with this member");
            }
            throw error;
        }
    }

    async updateShare(
        user: UserEntity,
        accountId: string,
        memberId: string,
        permission: AccountSharePermission,
    ): Promise<AccountShareEntity> {
        await this.assertOwner(user, accountId);

        const existing = await this.prismaService.accountShares.findUnique({
            where: {
                account_id_shared_with_id: {account_id: accountId, shared_with_id: memberId},
            },
        });
        if (!existing) throw new NotFoundException("Share not found");
        if (existing.permission === permission) {
            const share = await this.prismaService.accountShares.findUniqueOrThrow({
                where: {id: existing.id},
                include: {shared_with: true},
            });
            return this.toEntity(share);
        }

        const updated = await this.prismaService.$transaction(async (tx) => {
            const share = await tx.accountShares.update({
                where: {id: existing.id},
                data: {permission},
                include: {shared_with: true},
            });

            // Downgrading from WRITE to READ can strand cross-owner transfers
            // that rely on both sides being writable. Detach them proactively.
            if (existing.permission === AccountSharePermission.WRITE && permission === AccountSharePermission.READ) {
                await this.detachCrossOwnerTransfersFor(memberId, accountId, tx);
            }
            return share;
        });
        this.logger.log(`Share updated on account ${accountId} for user ${memberId} -> ${permission}`);
        return this.toEntity(updated);
    }

    async revokeShare(user: UserEntity, accountId: string, memberId: string): Promise<void> {
        await this.assertOwner(user, accountId);

        const existing = await this.prismaService.accountShares.findUnique({
            where: {
                account_id_shared_with_id: {account_id: accountId, shared_with_id: memberId},
            },
        });
        if (!existing) throw new NotFoundException("Share not found");

        await this.prismaService.$transaction(async (tx) => {
            // Any cross-owner transfer linking this account with an account of
            // the ex-sharee must be detached before the share row is dropped so
            // neither side can silently mirror mutations anymore.
            await this.detachCrossOwnerTransfersFor(memberId, accountId, tx);
            await tx.accountShares.delete({where: {id: existing.id}});
        });
        this.logger.log(`Share revoked on account ${accountId} for user ${memberId}`);
    }

    private async assertOwner(user: UserEntity, accountId: string) {
        const account = await this.prismaService.accounts.findUnique({
            where: {id: accountId},
        });
        if (!account) throw new NotFoundException("Account not found");
        if (account.user_id !== user.id) {
            throw new ForbiddenException("Only the account owner can manage its shares");
        }
        return account;
    }

    private async detachCrossOwnerTransfersFor(exSharedWithId: string, accountId: string, tx: TxClient): Promise<void> {
        // Transfers where one side is the account being un-shared (or downgraded)
        // and the other side belongs to the ex-sharee. Deleting the Transfers row
        // keeps both underlying transactions in place, per product decision.
        const transfers = await tx.transfers.findMany({
            where: {
                OR: [
                    {
                        debit_transaction: {account_id: accountId},
                        credit_transaction: {account: {user_id: exSharedWithId}},
                    },
                    {
                        credit_transaction: {account_id: accountId},
                        debit_transaction: {account: {user_id: exSharedWithId}},
                    },
                ],
            },
            select: {id: true},
        });

        if (transfers.length === 0) return;

        await tx.transfers.deleteMany({where: {id: {in: transfers.map((t) => t.id)}}});
        this.logger.log(
            `Detached ${transfers.length} cross-owner transfer(s) between account ${accountId} and user ${exSharedWithId}`,
        );
    }

    private toEntity(share: {
        id: string;
        account_id: string;
        shared_with_id: string;
        permission: AccountSharePermission;
        created_at: Date;
        updated_at: Date;
        shared_with: {username: string; email: string};
    }): AccountShareEntity {
        return new AccountShareEntity({
            id: share.id,
            accountId: share.account_id,
            sharedWithId: share.shared_with_id,
            sharedWithUsername: share.shared_with.username,
            sharedWithEmail: share.shared_with.email,
            permission: share.permission,
            createdAt: share.created_at,
            updatedAt: share.updated_at,
        });
    }
}
