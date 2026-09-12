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
            include: {shared_with: {select: {username: true, email: true}}},
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

        await this.assertSameFamily(user, memberId);

        try {
            const share = await this.prismaService.accountShares.create({
                data: {
                    account_id: account.id,
                    shared_with_id: memberId,
                    permission,
                },
                include: {shared_with: {select: {username: true, email: true}}},
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
        // Family membership can drift after the initial share (member quits or
        // is removed). Re-validate here so upgrades never grant WRITE to an
        // ex-family-member.
        await this.assertSameFamily(user, memberId);

        const existing = await this.prismaService.accountShares.findUnique({
            where: {
                account_id_shared_with_id: {account_id: accountId, shared_with_id: memberId},
            },
        });
        if (!existing) throw new NotFoundException("Share not found");
        if (existing.permission === permission) {
            const share = await this.prismaService.accountShares.findUniqueOrThrow({
                where: {id: existing.id},
                include: {shared_with: {select: {username: true, email: true}}},
            });
            return this.toEntity(share);
        }

        const updated = await this.prismaService.$transaction(async (tx) => {
            const share = await tx.accountShares.update({
                where: {id: existing.id},
                data: {permission},
                include: {shared_with: {select: {username: true, email: true}}},
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

    private async assertSameFamily(user: UserEntity, memberId: string): Promise<void> {
        const member = await this.prismaService.users.findUnique({
            where: {id: memberId},
            select: {id: true, family_id: true},
        });
        if (!member) throw new NotFoundException("Member not found");
        if (!user.familyId || member.family_id !== user.familyId) {
            throw new ForbiddenException("Member must belong to the same family");
        }
    }

    // Public: called by FamilyService to revoke every share involving a user
    // that is about to leave (or be removed from) the family. Detaches cross-
    // owner transfers first so no transaction pair silently persists.
    async revokeSharesForFamilyExit(memberId: string, familyMemberIds: string[], tx: TxClient): Promise<void> {
        if (familyMemberIds.length === 0) return;
        const shares = await tx.accountShares.findMany({
            where: {
                OR: [
                    // Shares where the leaving user is the sharee and the owner
                    // stays in the family.
                    {shared_with_id: memberId, account: {user_id: {in: familyMemberIds}}},
                    // Shares where the leaving user owns the account and the
                    // sharee stays in the family.
                    {shared_with_id: {in: familyMemberIds}, account: {user_id: memberId}},
                ],
            },
            select: {id: true, account_id: true, shared_with_id: true},
        });
        if (shares.length === 0) return;

        for (const share of shares) {
            // oxlint-disable-next-line no-await-in-loop
            await this.detachCrossOwnerTransfersFor(share.shared_with_id, share.account_id, tx);
        }
        await tx.accountShares.deleteMany({where: {id: {in: shares.map((s) => s.id)}}});
        this.logger.log(`Revoked ${shares.length} share(s) tied to family exit of user ${memberId}`);
    }

    // Public: called by FamilyService when a family is deleted; drops every
    // share whose owner AND sharee both belong to the destroyed family.
    async revokeAllSharesWithinFamily(familyMemberIds: string[], tx: TxClient): Promise<void> {
        if (familyMemberIds.length === 0) return;
        const shares = await tx.accountShares.findMany({
            where: {
                shared_with_id: {in: familyMemberIds},
                account: {user_id: {in: familyMemberIds}},
            },
            select: {id: true, account_id: true, shared_with_id: true},
        });
        if (shares.length === 0) return;

        for (const share of shares) {
            // oxlint-disable-next-line no-await-in-loop
            await this.detachCrossOwnerTransfersFor(share.shared_with_id, share.account_id, tx);
        }
        await tx.accountShares.deleteMany({where: {id: {in: shares.map((s) => s.id)}}});
        this.logger.log(`Revoked ${shares.length} share(s) tied to family deletion`);
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
