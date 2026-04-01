import {PrismaService} from "../../helper/prisma.service";
import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit,
} from "@nestjs/common";
import {AccountTypes} from "../../../../prisma/generated/enums";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {AccountEntity} from "./models/entities/account.entity";
import {Accounts} from "../../../../prisma/generated/client";
import {UpdateAccountDto} from "./models/dto/update-account.dto";

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
            const currentSum = expectedBalanceByAccount.get(transaction.account_id) ?? 0;
            expectedBalanceByAccount.set(transaction.account_id, currentSum + transaction.amount);
        }

        const EPSILON = 0.000001;
        const results: Array<{status: "valid" | "fixed" | "error"}> = [];
        for (const account of accounts) {
            try {
                const expectedBalance = this.toDecimal(expectedBalanceByAccount.get(account.id) ?? 0);
                const hasMismatch = Math.abs(account.balance - expectedBalance) > EPSILON;

                if (!hasMismatch) {
                    results.push({status: "valid"});
                    continue;
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
                results.push({status: "fixed"});
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`Integrity check failed for account ${account.id}: ${message}`);
                results.push({status: "error"});
            }
        }

        const fixedCount = results.filter((result) => result.status === "fixed").length;
        const validCount = results.filter((result) => result.status === "valid").length;
        const errorCount = results.filter((result) => result.status === "error").length;

        this.logger.log(`Integrity check completed: valid=${validCount}, fixed=${fixedCount}, errors=${errorCount}`);
    }

    async createAccount(
        user: UserEntity,
        name: string,
        accountType: AccountTypes,
        balance?: number,
    ): Promise<AccountEntity> {
        const account: Accounts = await this.prismaService.accounts.create({
            data: {
                user_id: user.id,
                name,
                balance: this.toDecimal(balance || 0),
                type: accountType,
            },
        });
        if (balance)
            await this.prismaService.transactions.create({
                data: {
                    account_id: account.id,
                    amount: balance,
                    description: "Account rebalance adjustment",
                    is_rebalance: true,
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
        const account: Accounts | null = await this.prismaService.accounts.findUnique({
            where: {
                id,
            },
        });
        if (!account) throw new NotFoundException("Account not found");
        if (account.user_id !== user.id)
            throw new ForbiddenException("You do not have permission to delete this account");
        return this.toAccountEntity(account);
    }

    async deleteAccount(user: UserEntity, accountId: string): Promise<void> {
        // Check if user is owner && if account exists
        const account: Accounts | null = await this.prismaService.accounts.findUnique({
            where: {
                id: accountId,
            },
        });
        if (!account) throw new NotFoundException("Account not found");
        if (account.user_id !== user.id)
            throw new ForbiddenException("You do not have permission to delete this account");
        await this.prismaService.accounts.delete({
            where: {
                id: accountId,
            },
        });
    }

    async updateAccount(user: UserEntity, accountId: string, body: UpdateAccountDto): Promise<AccountEntity> {
        const account = await this.prismaService.accounts.findUnique({
            where: {
                id: accountId,
            },
        });

        if (!account) throw new NotFoundException("Account not found");
        if (account.user_id !== user.id)
            throw new ForbiddenException("You do not have permission to update this account");

        const data: Partial<Pick<Accounts, "name" | "type" | "balance">> = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.type !== undefined) data.type = body.type;

        const hasBalanceUpdate = body.balance !== undefined;
        const targetBalance = hasBalanceUpdate ? this.toDecimal(body.balance as number) : account.balance;
        const rebalanceAmount = this.toDecimal(targetBalance - account.balance);

        if (hasBalanceUpdate) data.balance = targetBalance;

        const updatedAccount = await this.prismaService.$transaction(async (tx) => {
            const updated = await tx.accounts.update({
                where: {
                    id: accountId,
                },
                data,
            });

            if (hasBalanceUpdate && rebalanceAmount !== 0) {
                await tx.transactions.create({
                    data: {
                        account_id: accountId,
                        amount: rebalanceAmount,
                        description: "Account rebalance adjustment",
                        is_rebalance: true,
                    },
                });
            }

            return updated;
        });

        return this.toAccountEntity(updatedAccount);
    }

    async getAccountBalanceEvolution(
        user: UserEntity,
        accountId: string,
        startDate: string,
        endDate: string,
    ): Promise<Array<{date: Date; balance: number}>> {
        const account = await this.prismaService.accounts.findUnique({
            where: {
                id: accountId,
            },
        });

        if (!account) throw new NotFoundException("Account not found");
        if (account.user_id !== user.id)
            throw new ForbiddenException("You do not have permission to access this account");

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start > end) {
            throw new BadRequestException("startDate must be before endDate");
        }

        const transactions = await this.prismaService.transactions.findMany({
            where: {
                account_id: accountId,
                date: {
                    gte: start,
                    lte: end,
                },
            },
            orderBy: {
                date: "asc",
            },
        });

        const balanceBeforeStartRaw = await this.prismaService.transactions.aggregate({
            where: {
                account_id: accountId,
                date: {
                    lt: start,
                },
            },
            _sum: {
                amount: true,
            },
        });

        let runningBalance = this.toDecimal(balanceBeforeStartRaw._sum.amount ?? 0);

        const transactionsByDate = new Map<string, number>();
        for (const t of transactions) {
            const dateStr = t.date.toISOString().split("T")[0];
            const currentAmount = transactionsByDate.get(dateStr) || 0;
            transactionsByDate.set(dateStr, currentAmount + t.amount);
        }

        const evolution: Array<{date: Date; balance: number}> = [];

        let actualStart = new Date(start);
        if (actualStart.getFullYear() === 2000) {
            const firstTx = await this.prismaService.transactions.findFirst({
                where: {account_id: accountId},
                orderBy: {date: "asc"},
            });
            const earliestDate = firstTx && firstTx.date < account.created_at ? firstTx.date : account.created_at;

            if (actualStart < earliestDate) {
                actualStart = new Date(earliestDate);
            }
        }

        if (actualStart > end) {
            actualStart = new Date(end);
        }

        const currentDate = new Date(actualStart);
        currentDate.setUTCHours(0, 0, 0, 0);
        const endDay = new Date(end);
        endDay.setUTCHours(0, 0, 0, 0);

        if (currentDate > endDay) {
            evolution.push({
                date: new Date(endDay),
                balance: runningBalance,
            });
            return evolution;
        }

        while (currentDate <= endDay) {
            const dateStr = currentDate.toISOString().split("T")[0];
            if (transactionsByDate.has(dateStr)) {
                runningBalance = this.toDecimal(runningBalance + transactionsByDate.get(dateStr)!);
            }
            evolution.push({
                date: new Date(currentDate),
                balance: runningBalance,
            });
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        return evolution;
    }
}
