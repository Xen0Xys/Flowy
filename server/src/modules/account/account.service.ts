import {PrismaService} from "../helper/prisma.service";
import {
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit,
} from "@nestjs/common";
import {AccountTypes} from "../../../prisma/generated/enums";
import {UserEntity} from "../user/models/entities/user.entity";
import {AccountEntity} from "./models/entities/account.entity";
import {Accounts} from "../../../prisma/generated/client";

@Injectable()
export class AccountService implements OnModuleInit {
    private readonly logger = new Logger("AccountService");

    constructor(private readonly prismaService: PrismaService) {}

    async onModuleInit() {
        await this.checkIntegrity();
    }

    toDecimal(nb: number): number {
        // Return the number with 2 decimals
        return Math.round(nb * 100) / 100;
    }

    toAccountEntity(account: Accounts) {
        return new AccountEntity({
            id: account.id,
            ownerId: account.user_id,
            name: account.name,
            balance: account.balance,
            type: account.type,
            createdAt: account.created_at,
            updatedAt: account.updated_at,
        });
    }

    async checkIntegrity() {
        // For each account, check all transactions for balance mismatch, and fix it.
        const accounts = await this.prismaService.accounts.findMany();
        const transactions = await this.prismaService.transactions.findMany();

        this.logger.log(
            `Starting integrity check for ${accounts.length} account(s) and ${transactions.length} transaction(s)`,
        );

        const expectedBalanceByAccount = new Map<string, number>();
        for (const transaction of transactions) {
            const currentSum =
                expectedBalanceByAccount.get(transaction.account_id) ?? 0;
            expectedBalanceByAccount.set(
                transaction.account_id,
                currentSum + transaction.amount,
            );
        }

        const EPSILON = 0.000001;
        const results = await Promise.all(
            accounts.map(async (account) => {
                try {
                    const expectedBalance = this.toDecimal(
                        expectedBalanceByAccount.get(account.id) ?? 0,
                    );
                    const hasMismatch =
                        Math.abs(account.balance - expectedBalance) > EPSILON;

                    if (!hasMismatch) {
                        return {status: "valid" as const};
                    }

                    this.logger.warn(
                        `Integrity mismatch on account ${account.id} (${account.name}): current=${account.balance}, expected=${expectedBalance}. Applying fix.`,
                    );

                    await this.prismaService.accounts.update({
                        where: {
                            id: account.id,
                        },
                        data: {
                            balance: expectedBalance,
                        },
                    });

                    this.logger.log(
                        `Integrity fix applied on account ${account.id}: ${account.balance} -> ${expectedBalance}`,
                    );
                    return {status: "fixed" as const};
                } catch (error: unknown) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    this.logger.error(
                        `Integrity check failed for account ${account.id}: ${message}`,
                    );
                    return {status: "error" as const};
                }
            }),
        );

        const fixedCount = results.filter(
            (result) => result.status === "fixed",
        ).length;
        const validCount = results.filter(
            (result) => result.status === "valid",
        ).length;
        const errorCount = results.filter(
            (result) => result.status === "error",
        ).length;

        this.logger.log(
            `Integrity check completed: valid=${validCount}, fixed=${fixedCount}, errors=${errorCount}`,
        );
    }

    async createAccount(
        user: UserEntity,
        name: string,
        accountType: AccountTypes,
        balance?: number,
    ): Promise<AccountEntity> {
        const account = await this.prismaService.accounts.create({
            data: {
                user_id: user.id,
                name,
                balance: this.toDecimal(balance || 0),
                type: accountType,
            },
        });
        return this.toAccountEntity(account);
    }

    async getAccounts(user: UserEntity): Promise<AccountEntity[]> {
        const accounts = await this.prismaService.accounts.findMany({
            where: {
                user_id: user.id,
            },
        });
        return accounts.map((account) => this.toAccountEntity(account));
    }

    async getAccount(user: UserEntity, id: string): Promise<AccountEntity> {
        const account: Accounts | null =
            await this.prismaService.accounts.findUnique({
                where: {
                    id,
                },
            });
        if (!account) throw new NotFoundException("Account not found");
        if (account.user_id !== user.id)
            throw new ForbiddenException(
                "You do not have permission to delete this account",
            );
        return this.toAccountEntity(account);
    }

    async deleteAccount(user: UserEntity, accountId: string): Promise<void> {
        // Check if user is owner && if account exists
        const account: Accounts | null =
            await this.prismaService.accounts.findUnique({
                where: {
                    id: accountId,
                },
            });
        if (!account) throw new NotFoundException("Account not found");
        if (account.user_id !== user.id)
            throw new ForbiddenException(
                "You do not have permission to delete this account",
            );
        await this.prismaService.accounts.delete({
            where: {
                id: accountId,
            },
        });
    }
}
