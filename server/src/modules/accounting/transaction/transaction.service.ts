import {BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException} from "@nestjs/common";
import {PrismaService, TxClient} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {TransactionEntity} from "./models/entities/transaction.entity";
import {CreateTransactionDto} from "./models/dto/create-transaction.dto";
import {UpdateTransactionDto} from "./models/dto/update-transaction.dto";
import {CategoryEntity} from "../reference/models/entities/category.entity";
import {MerchantEntity} from "../reference/models/entities/merchant.entity";
import {Prisma} from "../../../../prisma/generated/client";
import {BulkAnalysisAccountEntity, BulkAnalysisEntity} from "./models/entities/bulk-analysis.entity";
import {
    SearchTransactionsDto,
    TransactionSearchRebalance,
    TransactionSearchType,
} from "./models/dto/search-transactions.dto";
import {SearchTransactionsResultEntity} from "./models/entities/search-transactions-result.entity";
import {DeleteTransactionQueryDto} from "./models/dto/delete-transaction-query.dto";

type TransactionWithRelations = Prisma.TransactionsGetPayload<{
    include: {
        merchant: true;
        category: true;
        credit_transfer: true;
        debit_transfer: true;
    };
}>;

@Injectable()
export class TransactionService {
    private readonly logger = new Logger(TransactionService.name);

    constructor(private readonly prismaService: PrismaService) {}

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
                credit_transfer: true,
                debit_transfer: true,
            },
            orderBy: {
                date: "desc",
            },
        });

        return transactions.map((transaction) => this.toTransactionEntity(transaction));
    }

    async getTransactionById(user: UserEntity, transactionId: string): Promise<TransactionEntity> {
        const transaction = await this.prismaService.transactions.findUnique({
            where: {id: transactionId},
            include: {
                account: true,
                merchant: true,
                category: true,
                credit_transfer: true,
                debit_transfer: true,
            },
        });

        if (!transaction) {
            throw new NotFoundException("Transaction not found");
        }

        if (transaction.account.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to access this transaction");
        }

        return this.toTransactionEntity(transaction);
    }

    async searchTransactions(user: UserEntity, query: SearchTransactionsDto): Promise<SearchTransactionsResultEntity> {
        const where: Prisma.TransactionsWhereInput = {
            account: {
                user_id: user.id,
            },
        };

        if (query.accountId) where.account_id = query.accountId;
        if (query.categoryId) where.category_id = query.categoryId;
        if (query.merchantId) where.merchant_id = query.merchantId;
        if (query.type === TransactionSearchType.INCOME) where.amount = {gt: 0};
        if (query.type === TransactionSearchType.EXPENSE) where.amount = {lt: 0};
        if (query.rebalance === TransactionSearchRebalance.ONLY) where.is_rebalance = true;
        if (query.rebalance === TransactionSearchRebalance.EXCLUDE) where.is_rebalance = false;

        if (query.startDate || query.endDate) {
            const dateRange: Prisma.DateTimeFilter = {};

            if (query.startDate) dateRange.gte = this.normalizeDateForRangeStart(query.startDate);
            if (query.endDate) dateRange.lte = this.normalizeDateForRangeEnd(query.endDate);
            if (dateRange.gte && dateRange.lte && dateRange.gte > dateRange.lte)
                throw new BadRequestException("startDate must be before or equal to endDate");

            where.date = dateRange;
        }

        const normalizedSearch = query.search?.trim();
        if (normalizedSearch) {
            where.OR = [
                {
                    description: {
                        contains: normalizedSearch,
                        mode: "insensitive",
                    },
                },
                {
                    merchant: {
                        is: {
                            name: {
                                contains: normalizedSearch,
                                mode: "insensitive",
                            },
                        },
                    },
                },
                {
                    category: {
                        is: {
                            name: {
                                contains: normalizedSearch,
                                mode: "insensitive",
                            },
                        },
                    },
                },
            ];
        }

        const isPaginated = query.page !== undefined || query.pageSize !== undefined;
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 25;

        if (!isPaginated) {
            const transactions = await this.prismaService.transactions.findMany({
                where,
                include: {
                    merchant: true,
                    category: true,
                    credit_transfer: true,
                    debit_transfer: true,
                },
                orderBy: [{date: "desc"}, {created_at: "desc"}],
            });

            const items = transactions.map((transaction) => this.toTransactionEntity(transaction));

            return new SearchTransactionsResultEntity({
                items,
                total: items.length,
                page: 1,
                pageSize: items.length,
                totalPages: 1,
                isPaginated: false,
            });
        }

        const [total, transactions] = await this.prismaService.$transaction([
            this.prismaService.transactions.count({where}),
            this.prismaService.transactions.findMany({
                where,
                include: {
                    merchant: true,
                    category: true,
                    credit_transfer: true,
                    debit_transfer: true,
                },
                orderBy: [{date: "desc"}, {created_at: "desc"}],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);

        const items = transactions.map((transaction) => this.toTransactionEntity(transaction));
        const totalPages = Math.ceil(total / pageSize);

        if (totalPages > 0 && page > totalPages) {
            this.logger.warn(`Requested page ${page} exceeds total pages ${totalPages} for user ${user.id}`);
        }

        return new SearchTransactionsResultEntity({
            items,
            total,
            page,
            pageSize,
            totalPages,
            isPaginated: true,
        });
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
                    date: this.normalizeTransactionDate(createTransactionDto.date),
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
                credit_transfer: true,
                debit_transfer: true,
            },
        });

        return this.toTransactionEntity(createdTransaction);
    }

    async testBulkTransactions(
        user: UserEntity,
        accountId: string,
        createTransactionDtos: CreateTransactionDto[],
    ): Promise<{
        wouldInsertCount: number;
        duplicates: CreateTransactionDto[];
    }> {
        const analysis = await this.analyzeBulkTransactionsAgainstDatabase(user, accountId, createTransactionDtos);

        return {
            wouldInsertCount: analysis.toInsert.length,
            duplicates: analysis.duplicates,
        };
    }

    async addBulkTransactions(
        user: UserEntity,
        accountId: string,
        createTransactionDtos: CreateTransactionDto[],
    ): Promise<{
        insertedCount: number;
        duplicates: CreateTransactionDto[];
    }> {
        return this.prismaService.$transaction(async (tx) => {
            const analysis = await this.analyzeBulkTransactionsAgainstDatabase(
                user,
                accountId,
                createTransactionDtos,
                tx,
            );

            if (analysis.toInsert.length === 0) {
                return {
                    insertedCount: 0,
                    duplicates: analysis.duplicates,
                };
            }

            const totalAmount = analysis.toInsert.reduce(
                (sum, transaction) => this.toDecimal(sum + transaction.amount),
                0,
            );

            await tx.transactions.createMany({
                data: analysis.toInsert.map((transaction) => ({
                    account_id: accountId,
                    amount: transaction.amount,
                    description: transaction.description,
                    date: this.normalizeTransactionDate(transaction.date),
                    merchant_id: transaction.merchantId,
                    category_id: transaction.categoryId,
                    is_rebalance: transaction.isRebalance ?? false,
                })),
            });

            await tx.accounts.update({
                where: {id: accountId},
                data: {
                    balance: this.toDecimal(analysis.account.balance + totalAmount),
                },
            });

            return {
                insertedCount: analysis.toInsert.length,
                duplicates: analysis.duplicates,
            };
        });
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
                    ...(updateTransactionDto.date !== undefined
                        ? {date: this.normalizeTransactionDate(updateTransactionDto.date)}
                        : {}),
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
                credit_transfer: true,
                debit_transfer: true,
            },
        });

        return this.toTransactionEntity(hydratedTransaction);
    }

    async deleteTransaction(user: UserEntity, transactionId: string, query: DeleteTransactionQueryDto): Promise<void> {
        const transaction = await this.prismaService.transactions.findUnique({
            where: {id: transactionId},
            include: {
                account: true,
                debit_transfer: true,
                credit_transfer: true,
            },
        });

        if (!transaction) throw new NotFoundException("Transaction not found");
        if (transaction.account.user_id !== user.id)
            throw new ForbiddenException("You do not have permission to delete this transaction");

        const transfer = transaction.debit_transfer ?? transaction.credit_transfer;
        const shouldDeleteLinkedTransaction = query.keepLinkedTransaction === "false";

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

            if (!transfer || !shouldDeleteLinkedTransaction) {
                return;
            }

            const linkedTransactionId =
                transfer.debit_transaction_id === transactionId
                    ? transfer.credit_transaction_id
                    : transfer.debit_transaction_id;

            const linkedTransaction = await tx.transactions.findUnique({
                where: {id: linkedTransactionId},
                include: {
                    account: true,
                },
            });

            if (!linkedTransaction) {
                throw new NotFoundException("Transaction not found");
            }

            if (linkedTransaction.account.user_id !== user.id) {
                throw new ForbiddenException("You do not have permission to delete this transaction");
            }

            await tx.transactions.delete({
                where: {id: linkedTransactionId},
            });

            await tx.accounts.update({
                where: {
                    id: linkedTransaction.account_id,
                },
                data: {
                    balance: this.toDecimal(linkedTransaction.account.balance - linkedTransaction.amount),
                },
            });
        });
    }

    toTransactionEntity(transaction: TransactionWithRelations): TransactionEntity {
        let linkedTransactionId: string | undefined;
        if (transaction.debit_transfer) linkedTransactionId = transaction.debit_transfer.credit_transaction_id;
        else if (transaction.credit_transfer) linkedTransactionId = transaction.credit_transfer.debit_transaction_id;
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
            linkedTransactionId,
            createdAt: transaction.created_at,
            updatedAt: transaction.updated_at,
        });
    }

    private normalizeTransactionDate(date: string | Date): Date {
        const parsedDate = date instanceof Date ? date : new Date(date);

        if (Number.isNaN(parsedDate.getTime()))
            throw new BadRequestException("Invalid transaction date. Expected ISO-8601 date or datetime");

        return parsedDate;
    }

    private toDecimal(nb: number): number {
        return Math.round(nb * 100) / 100;
    }

    private normalizeDateForRangeStart(date: string): Date {
        const parsedDate = this.normalizeTransactionDate(date);

        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) parsedDate.setUTCHours(0, 0, 0, 0);

        return parsedDate;
    }

    private normalizeDateForRangeEnd(date: string): Date {
        const parsedDate = this.normalizeTransactionDate(date);

        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) parsedDate.setUTCHours(23, 59, 59, 999);

        return parsedDate;
    }

    private async getOwnedAccountOrThrow(user: UserEntity, accountId: string, tx?: TxClient) {
        const prisma = this.prismaService.withTx(tx);
        const account = await prisma.accounts.findUnique({
            where: {id: accountId},
        });

        if (!account) throw new NotFoundException("Account not found");
        if (account.user_id !== user.id)
            throw new ForbiddenException("You do not have permission to access this account");

        return account;
    }

    private async validateReferencesOwnership(
        user: UserEntity,
        merchantId?: string | null,
        categoryId?: string | null,
        tx?: TxClient,
    ): Promise<void> {
        const prisma = this.prismaService.withTx(tx);

        if (merchantId) {
            const merchant = await prisma.userMerchants.findUnique({
                where: {id: merchantId},
            });

            if (!merchant || merchant.user_id !== user.id) throw new NotFoundException("Merchant not found");
        }

        if (categoryId) {
            const category = await prisma.userCategories.findUnique({
                where: {id: categoryId},
            });

            if (!category || category.user_id !== user.id) {
                throw new NotFoundException("Category not found");
            }
        }
    }

    private async validateBulkReferencesOwnership(
        user: UserEntity,
        createTransactionDtos: CreateTransactionDto[],
        tx?: TxClient,
    ): Promise<void> {
        const prisma = this.prismaService.withTx(tx);

        const merchantIds = Array.from(
            new Set(
                createTransactionDtos.map((transaction) => transaction.merchantId).filter((id): id is string => !!id),
            ),
        );
        const categoryIds = Array.from(
            new Set(
                createTransactionDtos.map((transaction) => transaction.categoryId).filter((id): id is string => !!id),
            ),
        );

        if (merchantIds.length > 0) {
            const ownedMerchants = await prisma.userMerchants.findMany({
                where: {
                    id: {in: merchantIds},
                    user_id: user.id,
                },
                select: {
                    id: true,
                },
            });

            const ownedMerchantIds = new Set(ownedMerchants.map((merchant) => merchant.id));
            const hasMissingMerchant = merchantIds.some((merchantId) => !ownedMerchantIds.has(merchantId));

            if (hasMissingMerchant) throw new NotFoundException("Merchant not found");
        }

        if (categoryIds.length > 0) {
            const ownedCategories = await prisma.userCategories.findMany({
                where: {
                    id: {in: categoryIds},
                    user_id: user.id,
                },
                select: {
                    id: true,
                },
            });

            const ownedCategoryIds = new Set(ownedCategories.map((category) => category.id));
            const hasMissingCategory = categoryIds.some((categoryId) => !ownedCategoryIds.has(categoryId));

            if (hasMissingCategory) throw new NotFoundException("Category not found");
        }
    }

    private buildTransactionSignature(transaction: {amount: number; description: string; date: string | Date}): string {
        const amount = this.toDecimal(transaction.amount);
        const description = transaction.description;
        const date = this.normalizeTransactionDate(transaction.date).toISOString();

        return JSON.stringify([amount, description, date]);
    }

    private async analyzeBulkTransactionsAgainstDatabase(
        user: UserEntity,
        accountId: string,
        createTransactionDtos: CreateTransactionDto[],
        tx?: TxClient,
    ): Promise<BulkAnalysisEntity> {
        const prisma = this.prismaService.withTx(tx);

        const account = await this.getOwnedAccountOrThrow(user, accountId, tx);
        await this.validateBulkReferencesOwnership(user, createTransactionDtos, tx);

        if (createTransactionDtos.length === 0) {
            return new BulkAnalysisEntity({
                account: new BulkAnalysisAccountEntity({
                    id: account.id,
                    balance: account.balance,
                }),
                toInsert: [],
                duplicates: [],
            });
        }

        const existingTransactions = await prisma.transactions.findMany({
            where: {
                account_id: accountId,
            },
            select: {
                amount: true,
                description: true,
                date: true,
            },
        });

        const existingSignatures = new Set(
            existingTransactions.map((transaction) =>
                this.buildTransactionSignature({
                    amount: transaction.amount,
                    description: transaction.description,
                    date: transaction.date,
                }),
            ),
        );

        const toInsert: CreateTransactionDto[] = [];
        const duplicates: CreateTransactionDto[] = [];

        for (const transaction of createTransactionDtos) {
            const signature = this.buildTransactionSignature(transaction);

            if (existingSignatures.has(signature)) {
                duplicates.push({...transaction});
                continue;
            }

            toInsert.push(transaction);
        }

        return new BulkAnalysisEntity({
            account: new BulkAnalysisAccountEntity({
                id: account.id,
                balance: account.balance,
            }),
            toInsert,
            duplicates,
        });
    }
}
