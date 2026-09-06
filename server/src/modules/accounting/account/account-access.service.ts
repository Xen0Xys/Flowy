import {ForbiddenException, Injectable, NotFoundException} from "@nestjs/common";
import {PrismaService, TxClient} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {AccountSharePermission} from "../../../../prisma/generated/enums";
import {Accounts} from "../../../../prisma/generated/client";

export type AccessLevel = "owner" | "write" | "read";
export type RequiredAccessLevel = "read" | "write";

@Injectable()
export class AccountAccessService {
    constructor(private readonly prismaService: PrismaService) {}

    async getAccessLevel(user: UserEntity, accountId: string, tx?: TxClient): Promise<AccessLevel | null> {
        const prisma = this.prismaService.withTx(tx);
        const account = await prisma.accounts.findUnique({
            where: {id: accountId},
            select: {user_id: true},
        });
        if (!account) return null;
        if (account.user_id === user.id) return "owner";

        const share = await prisma.accountShares.findUnique({
            where: {
                account_id_shared_with_id: {
                    account_id: accountId,
                    shared_with_id: user.id,
                },
            },
            select: {permission: true},
        });
        if (!share) return null;
        return share.permission === AccountSharePermission.WRITE ? "write" : "read";
    }

    async assertAccess(user: UserEntity, accountId: string, min: RequiredAccessLevel, tx?: TxClient): Promise<Accounts> {
        const prisma = this.prismaService.withTx(tx);
        const account = await prisma.accounts.findUnique({
            where: {id: accountId},
        });
        if (!account) throw new NotFoundException("Account not found");

        if (account.user_id === user.id) return account;

        const share = await prisma.accountShares.findUnique({
            where: {
                account_id_shared_with_id: {
                    account_id: accountId,
                    shared_with_id: user.id,
                },
            },
            select: {permission: true},
        });

        if (!share) throw new ForbiddenException("You do not have permission to access this account");

        if (min === "write" && share.permission !== AccountSharePermission.WRITE) {
            throw new ForbiddenException("You do not have permission to modify this account");
        }

        return account;
    }

    async getAccessibleAccountIds(user: UserEntity, min: RequiredAccessLevel, tx?: TxClient): Promise<string[]> {
        const prisma = this.prismaService.withTx(tx);
        const [owned, shared] = await Promise.all([
            prisma.accounts.findMany({
                where: {user_id: user.id},
                select: {id: true},
            }),
            prisma.accountShares.findMany({
                where: {
                    shared_with_id: user.id,
                    ...(min === "write" ? {permission: AccountSharePermission.WRITE} : {}),
                },
                select: {account_id: true},
            }),
        ]);
        return [...owned.map((a) => a.id), ...shared.map((s) => s.account_id)];
    }

    async getAccessMap(user: UserEntity, accountIds: string[], tx?: TxClient): Promise<Map<string, AccessLevel>> {
        const map = new Map<string, AccessLevel>();
        if (accountIds.length === 0) return map;

        const prisma = this.prismaService.withTx(tx);
        const uniqueIds = Array.from(new Set(accountIds));

        const [owned, shared] = await Promise.all([
            prisma.accounts.findMany({
                where: {id: {in: uniqueIds}, user_id: user.id},
                select: {id: true},
            }),
            prisma.accountShares.findMany({
                where: {shared_with_id: user.id, account_id: {in: uniqueIds}},
                select: {account_id: true, permission: true},
            }),
        ]);

        for (const account of owned) map.set(account.id, "owner");
        for (const share of shared) {
            if (map.has(share.account_id)) continue;
            map.set(share.account_id, share.permission === AccountSharePermission.WRITE ? "write" : "read");
        }
        return map;
    }
}
