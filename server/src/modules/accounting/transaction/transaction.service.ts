import {ForbiddenException, Injectable, NotFoundException} from "@nestjs/common";
import {PrismaService} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {TransactionEntity} from "./models/entities/transaction.entity";
import {CreateTransactionDto} from "./models/dto/create-transaction.dto";
import {UpdateTransactionDto} from "./models/dto/update-transaction.dto";
import {CategoryEntity} from "../reference/models/entities/category.entity";
import {MerchantEntity} from "../reference/models/entities/merchant.entity";
import {Prisma} from "../../../../prisma/generated/client";

type TransactionWithRelations = Prisma.TransactionsGetPayload<{
    include: {
        merchant: true;
        category: true;
    };
}>;

@Injectable()
export class TransactionService {
    constructor(private readonly prismaService: PrismaService) {}

    private toDecimal(nb: number): number {
        return Math.round(nb * 100) / 100;
    }

    private toTransactionEntity(transaction: TransactionWithRelations): TransactionEntity {
        return new TransactionEntity({
            id: transaction.id,
            accountId: transaction.account_id,
            amount: transaction.amount,
            description: transaction.description,
            date: transaction.date,
            ...(transaction.merchant
                ? {
                      merchant: new MerchantEntity({
                          id: transaction.merchant.id,
                          userId: transaction.merchant.user_id,
                          name: transaction.merchant.name,
                          createdAt: transaction.merchant.created_at,
                          updatedAt: transaction.merchant.updated_at,
                      }),
                  }
                : {}),
            ...(transaction.category
                ? {
                      category: new CategoryEntity({
                          id: transaction.category.id,
                          userId: transaction.category.user_id,
                          name: transaction.category.name,
                          hexColor: transaction.category.hex_color,
                          icon: transaction.category.icon,
                          createdAt: transaction.category.created_at,
                          updatedAt: transaction.category.updated_at,
                      }),
                  }
                : {}),
            isRebalance: transaction.is_rebalance,
            createdAt: transaction.created_at,
            updatedAt: transaction.updated_at,
        });
    }

    private async getOwnedAccountOrThrow(user: UserEntity, accountId: string) {
        const account = await this.prismaService.accounts.findUnique({
            where: {id: accountId},
        });

        if (!account) {
            throw new NotFoundException("Account not found");
        }

        if (account.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to access this account");
        }

        return account;
    }

    private async validateReferencesOwnership(
        user: UserEntity,
        merchantId?: string | null,
        categoryId?: string | null,
    ): Promise<void> {
        if (merchantId) {
            const merchant = await this.prismaService.userMerchants.findUnique({
                where: {id: merchantId},
            });

            if (!merchant || merchant.user_id !== user.id) {
                throw new NotFoundException("Merchant not found");
            }
        }

        if (categoryId) {
            const category = await this.prismaService.userCategories.findUnique({
                where: {id: categoryId},
            });

            if (!category || category.user_id !== user.id) {
                throw new NotFoundException("Category not found");
            }
        }
    }

    async getTransactions(user: UserEntity): Promise<TransactionEntity[]> {
        const transactions = await this.prismaService.transactions.findMany({
            where: {
                account: {
                    user_id: user.id,
                },
            },
            include: {
                merchant: true,
                category: true,
            },
            orderBy: {
                date: "desc",
            },
        });

        return transactions.map((transaction) => this.toTransactionEntity(transaction));
    }

    async getTransactionsByAccountId(user: UserEntity, accountId: string): Promise<TransactionEntity[]> {
        await this.getOwnedAccountOrThrow(user, accountId);

        const transactions = await this.prismaService.transactions.findMany({
            where: {
                account_id: accountId,
            },
            include: {
                merchant: true,
                category: true,
            },
            orderBy: {
                date: "desc",
            },
        });

        return transactions.map((transaction) => this.toTransactionEntity(transaction));
    }

    async addTransactions(
        user: UserEntity,
        accountId: string,
        createTransactionDto: CreateTransactionDto,
    ): Promise<TransactionEntity> {
        const account = await this.getOwnedAccountOrThrow(user, accountId);
        await this.validateReferencesOwnership(user, createTransactionDto.merchantId, createTransactionDto.categoryId);

        const transaction = await this.prismaService.$transaction(async (tx) => {
            await tx.accounts.update({
                where: {id: accountId},
                data: {
                    balance: this.toDecimal(account.balance + createTransactionDto.amount),
                },
            });

            return tx.transactions.create({
                data: {
                    account_id: accountId,
                    amount: createTransactionDto.amount,
                    description: createTransactionDto.description,
                    date: createTransactionDto.date,
                    merchant_id: createTransactionDto.merchantId,
                    category_id: createTransactionDto.categoryId,
                    is_rebalance: createTransactionDto.isRebalance ?? false,
                },
            });
        });

        const createdTransaction = await this.prismaService.transactions.findUniqueOrThrow({
            where: {id: transaction.id},
            include: {
                merchant: true,
                category: true,
            },
        });

        return this.toTransactionEntity(createdTransaction);
    }

    async updateTransaction(
        user: UserEntity,
        transactionId: string,
        updateTransactionDto: UpdateTransactionDto,
    ): Promise<TransactionEntity> {
        const transaction = await this.prismaService.transactions.findUnique({
            where: {id: transactionId},
            include: {
                account: true,
                merchant: true,
                category: true,
            },
        });

        if (!transaction) {
            throw new NotFoundException("Transaction not found");
        }

        if (transaction.account.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to update this transaction");
        }

        await this.validateReferencesOwnership(user, updateTransactionDto.merchantId, updateTransactionDto.categoryId);

        const nextAmount = updateTransactionDto.amount !== undefined ? updateTransactionDto.amount : transaction.amount;
        const delta = this.toDecimal(nextAmount - transaction.amount);

        const updatedTransaction = await this.prismaService.$transaction(async (tx) => {
            await tx.accounts.update({
                where: {id: transaction.account_id},
                data: {
                    balance: this.toDecimal(transaction.account.balance + delta),
                },
            });

            return tx.transactions.update({
                where: {id: transactionId},
                data: {
                    ...(updateTransactionDto.amount !== undefined ? {amount: updateTransactionDto.amount} : {}),
                    ...(updateTransactionDto.description !== undefined
                        ? {description: updateTransactionDto.description}
                        : {}),
                    ...(updateTransactionDto.date !== undefined ? {date: updateTransactionDto.date} : {}),
                    ...(updateTransactionDto.merchantId !== undefined
                        ? {merchant_id: updateTransactionDto.merchantId}
                        : {}),
                    ...(updateTransactionDto.categoryId !== undefined
                        ? {category_id: updateTransactionDto.categoryId}
                        : {}),
                    ...(updateTransactionDto.isRebalance !== undefined
                        ? {is_rebalance: updateTransactionDto.isRebalance}
                        : {}),
                },
            });
        });

        const hydratedTransaction = await this.prismaService.transactions.findUniqueOrThrow({
            where: {id: updatedTransaction.id},
            include: {
                merchant: true,
                category: true,
            },
        });

        return this.toTransactionEntity(hydratedTransaction);
    }

    async deleteTransaction(user: UserEntity, transactionId: string): Promise<void> {
        const transaction = await this.prismaService.transactions.findUnique({
            where: {id: transactionId},
            include: {
                account: true,
            },
        });

        if (!transaction) {
            throw new NotFoundException("Transaction not found");
        }

        if (transaction.account.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to delete this transaction");
        }

        await this.prismaService.$transaction(async (tx) => {
            await tx.transactions.delete({
                where: {id: transactionId},
            });

            await tx.accounts.update({
                where: {
                    id: transaction.account_id,
                },
                data: {
                    balance: this.toDecimal(transaction.account.balance - transaction.amount),
                },
            });
        });
    }
}
