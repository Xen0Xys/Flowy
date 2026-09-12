import {BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException} from "@nestjs/common";
import {PrismaService, TxClient} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {BudgetEntity} from "./models/entities/budget.entity";
import {BudgetedCategoryEntity} from "./models/entities/budgeted-category.entity";
import type {RenewableBudget} from "./models/entities/budget-spending.entity";
import {BudgetSpendingCategoryEntity, BudgetSpendingEntity} from "./models/entities/budget-spending.entity";
import {CreateBudgetDto} from "./models/dto/create-budget.dto";
import {GetPlannedByAccountsDto} from "./models/dto/get-planned-by-accounts.dto";
import {UpdateBudgetDto} from "./models/dto/update-budget.dto";
import {BudgetedCategories, Budgets, UserCategories} from "../../../../prisma/generated/client";
import {RecurringTransactionService} from "../recurring-transaction/recurring-transaction.service";
import {AccessLevel, AccountAccessService} from "../account/account-access.service";

type BudgetedCategoryWithCategory = BudgetedCategories & {
    category: Pick<UserCategories, "name" | "hex_color" | "icon">;
};

type BudgetWithRelations = Budgets & {
    budgeted_categories: BudgetedCategoryWithCategory[];
    accounts: {account_id: string}[];
};

const BUDGETED_CATEGORY_INCLUDE = {
    category: {select: {name: true, hex_color: true, icon: true}},
} as const;

@Injectable()
export class BudgetService {
    private readonly logger = new Logger(BudgetService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly recurringTransactionService: RecurringTransactionService,
        private readonly accountAccess: AccountAccessService,
    ) {}

    async getBudgetsByPeriod(user: UserEntity, year: number, month: number): Promise<BudgetEntity[]> {
        this.validateMonthAndYear(year, month);

        // Fetch the read + write account sets once so effective permission is
        // computed in memory rather than firing 2 Prisma queries per budget.
        const [readableAccountIds, writableAccountIds] = await Promise.all([
            this.accountAccess.getAccessibleAccountIds(user, "read"),
            this.accountAccess.getAccessibleAccountIds(user, "write"),
        ]);
        const writableSet = new Set(writableAccountIds);

        // Budgets surface either because the caller owns them, or because
        // every one of their accounts is at least readable. Doing the second
        // check at the DB level avoids over-fetching hydrated rows we would
        // just discard in code.
        const candidates = await this.prismaService.budgets.findMany({
            where: {
                month,
                year,
                OR: [
                    {user_id: user.id},
                    {
                        AND: [
                            {accounts: {some: {account_id: {in: readableAccountIds}}}},
                            {NOT: {accounts: {some: {account_id: {notIn: readableAccountIds}}}}},
                        ],
                    },
                ],
            },
            include: {
                budgeted_categories: {include: BUDGETED_CATEGORY_INCLUDE},
                accounts: {select: {account_id: true}},
            },
        });

        return candidates.map((budget) => {
            const permission = this.effectivePermissionFromSets(user, budget, writableSet);
            return this.toBudgetEntity(budget, permission);
        });
    }

    // In-memory permission derivation for a budget whose accounts are known
    // to be at least readable by the caller.
    private effectivePermissionFromSets(
        user: UserEntity,
        budget: BudgetWithRelations,
        writableSet: Set<string>,
    ): AccessLevel {
        if (budget.user_id === user.id) return "owner";
        for (const link of budget.accounts) {
            if (!writableSet.has(link.account_id)) return "read";
        }
        return "write";
    }

    async getBudgetById(user: UserEntity, budgetId: string): Promise<BudgetEntity> {
        const {budget, permission} = await this.getBudgetAndPermissionOrThrow(user, budgetId, "read");
        return this.toBudgetEntity(budget, permission);
    }

    async createBudget(user: UserEntity, dto: CreateBudgetDto): Promise<BudgetEntity> {
        const categoryIds = dto.categories.map((c) => c.categoryId);
        this.validateUniqueCategoryIds(categoryIds);
        this.validateMonthAndYear(dto.year, dto.month);

        const uniqueAccountIds = Array.from(new Set(dto.accountIds));
        if (uniqueAccountIds.length !== dto.accountIds.length) {
            throw new BadRequestException("Each account can only be listed once per budget");
        }

        // All accounts must belong to a single owner and the current user must
        // have write access on every one of them.
        const accessMap = await this.accountAccess.getAccessMap(user, uniqueAccountIds);
        if (accessMap.size !== uniqueAccountIds.length) {
            throw new BadRequestException("One or more accounts are not accessible");
        }
        for (const level of accessMap.values()) {
            if (level === "read") {
                throw new ForbiddenException("Write access is required on every account of the budget");
            }
        }

        const accounts = await this.prismaService.accounts.findMany({
            where: {id: {in: uniqueAccountIds}},
            select: {id: true, user_id: true},
        });
        const ownerIds = new Set(accounts.map((a) => a.user_id));
        if (ownerIds.size !== 1) {
            throw new BadRequestException("All accounts of a budget must belong to the same owner");
        }
        const ownerUserId = accounts[0].user_id;

        await this.validateCategoriesBelongToOwner(ownerUserId, categoryIds);

        const budget = await this.prismaService.$transaction(async (tx) => {
            const created = await tx.budgets.create({
                data: {
                    user_id: ownerUserId,
                    name: dto.name ?? null,
                    month: dto.month,
                    year: dto.year,
                    budgeted_income: dto.budgetedIncome,
                    budgeted_categories: {
                        create: dto.categories.map((c) => ({
                            category_id: c.categoryId,
                            amount: c.amount,
                        })),
                    },
                    accounts: {
                        create: uniqueAccountIds.map((accountId) => ({account_id: accountId})),
                    },
                },
                include: {
                    budgeted_categories: {include: BUDGETED_CATEGORY_INCLUDE},
                    accounts: {select: {account_id: true}},
                },
            });
            return created;
        });

        const effectivePermission: AccessLevel = ownerUserId === user.id ? "owner" : "write";
        this.logger.log(`actor=${user.id} action=budget.create budget=${budget.id} owner=${ownerUserId}`);
        return this.toBudgetEntity(budget, effectivePermission);
    }

    async updateBudget(user: UserEntity, budgetId: string, dto: UpdateBudgetDto): Promise<BudgetEntity> {
        const {budget: existing, permission} = await this.getBudgetAndPermissionOrThrow(user, budgetId, "write");

        // Only the owner may change the account scope; sharees keep the same accounts.
        if (dto.accountIds !== undefined && permission !== "owner") {
            throw new ForbiddenException("Only the budget owner can change the accounts of the budget");
        }

        if (dto.month !== undefined || dto.year !== undefined) {
            this.validateMonthAndYear(dto.year ?? existing.year, dto.month ?? existing.month);
        }

        const categoryIds = dto.categories?.map((c) => c.categoryId) ?? [];
        if (categoryIds.length > 0) {
            this.validateUniqueCategoryIds(categoryIds);
            await this.validateCategoriesBelongToOwner(existing.user_id, categoryIds);
        }

        let nextAccountIds: string[] | undefined;
        if (dto.accountIds !== undefined) {
            const uniqueIds = Array.from(new Set(dto.accountIds));
            if (uniqueIds.length !== dto.accountIds.length) {
                throw new BadRequestException("Each account can only be listed once per budget");
            }
            const accounts = await this.prismaService.accounts.findMany({
                where: {id: {in: uniqueIds}},
                select: {id: true, user_id: true},
            });
            if (accounts.length !== uniqueIds.length) {
                throw new BadRequestException("One or more accounts do not exist");
            }
            for (const account of accounts) {
                if (account.user_id !== existing.user_id) {
                    throw new BadRequestException("All accounts of a budget must belong to the budget owner");
                }
            }
            nextAccountIds = uniqueIds;
        }

        const updated = await this.prismaService.$transaction(async (tx) => {
            const prisma = this.prismaService.withTx(tx);

            const data: Parameters<typeof prisma.budgets.update>[0]["data"] = {};
            if (dto.name !== undefined) data.name = dto.name;
            if (dto.month !== undefined) data.month = dto.month;
            if (dto.year !== undefined) data.year = dto.year;
            if (dto.budgetedIncome !== undefined) data.budgeted_income = dto.budgetedIncome;

            await prisma.budgets.update({where: {id: budgetId}, data});

            if (dto.categories !== undefined) {
                await prisma.budgetedCategories.deleteMany({where: {budget_id: budgetId}});
                if (dto.categories.length > 0) {
                    await prisma.budgetedCategories.createMany({
                        data: dto.categories.map((c) => ({
                            budget_id: budgetId,
                            category_id: c.categoryId,
                            amount: c.amount,
                        })),
                    });
                }
            }

            if (nextAccountIds !== undefined) {
                await prisma.budgetAccounts.deleteMany({where: {budget_id: budgetId}});
                await prisma.budgetAccounts.createMany({
                    data: nextAccountIds.map((accountId) => ({budget_id: budgetId, account_id: accountId})),
                });
            }

            return prisma.budgets.findUniqueOrThrow({
                where: {id: budgetId},
                include: {
                    budgeted_categories: {include: BUDGETED_CATEGORY_INCLUDE},
                    accounts: {select: {account_id: true}},
                },
            });
        });

        this.logger.log(`actor=${user.id} action=budget.update budget=${budgetId}`);
        return this.toBudgetEntity(updated, permission);
    }

    async deleteBudget(user: UserEntity, budgetId: string): Promise<void> {
        await this.getBudgetAndPermissionOrThrow(user, budgetId, "write");
        await this.prismaService.budgets.delete({where: {id: budgetId}});
        this.logger.log(`actor=${user.id} action=budget.delete budget=${budgetId}`);
    }

    async getSpending(user: UserEntity, budgetId: string): Promise<BudgetSpendingEntity> {
        const {budget} = await this.getBudgetAndPermissionOrThrow(user, budgetId, "read");

        const accountIds = budget.accounts.map((a) => a.account_id);
        if (accountIds.length === 0) {
            return new BudgetSpendingEntity({
                totalSpent: 0,
                totalPlanned: 0,
                actualIncome: 0,
                byCategory: [],
                plannedByCategory: [],
            });
        }

        const startDate = new Date(budget.year, budget.month - 1, 1);
        const endDate = new Date(budget.year, budget.month, 0, 23, 59, 59, 999);

        const expenseTransactions = await this.prismaService.transactions.findMany({
            where: {
                account_id: {in: accountIds},
                amount: {lt: 0},
                date: {gte: startDate, lte: endDate},
                in_budget: true,
            },
            select: {category_id: true, amount: true},
        });

        const incomeTransactions = await this.prismaService.transactions.findMany({
            where: {
                account_id: {in: accountIds},
                amount: {gt: 0},
                date: {gte: startDate, lte: endDate},
                in_budget: true,
            },
            select: {amount: true},
        });

        const categorySpending = new Map<string | null, number>();
        for (const tx of expenseTransactions) {
            const key = tx.category_id;
            categorySpending.set(key, (categorySpending.get(key) ?? 0) + Math.abs(tx.amount));
        }

        const plannedByCategoryMap = await this.recurringTransactionService.getPlannedByCategoryForMonth(
            user,
            budget.year,
            budget.month,
            accountIds,
        );

        const spendingCategoryIds = [...new Set([...categorySpending.keys()].filter((id): id is string => id !== null))];
        const plannedCategoryIds = [...plannedByCategoryMap.keys()].filter((id): id is string => id !== null);
        const allCategoryIds = [...new Set([...spendingCategoryIds, ...plannedCategoryIds])];

        const categories =
            allCategoryIds.length > 0
                ? await this.prismaService.userCategories.findMany({
                      where: {id: {in: allCategoryIds}},
                      select: {id: true, name: true, hex_color: true, icon: true},
                  })
                : [];

        const categoryMap = new Map(categories.map((c) => [c.id, {name: c.name, hexColor: c.hex_color, icon: c.icon}]));

        const byCategory: BudgetSpendingCategoryEntity[] = [];
        for (const [catId, rawSpent] of categorySpending.entries()) {
            const spent = Math.round(rawSpent * 100) / 100;
            if (catId === null) {
                byCategory.push(
                    new BudgetSpendingCategoryEntity({
                        categoryId: null,
                        hexColor: "#94a3b8",
                        icon: "iconoir:question-mark",
                        spent,
                        planned: 0,
                    }),
                );
            } else {
                const cat = categoryMap.get(catId);
                if (cat) {
                    byCategory.push(
                        new BudgetSpendingCategoryEntity({
                            categoryId: catId,
                            name: cat.name,
                            hexColor: cat.hexColor,
                            icon: cat.icon,
                            spent,
                            planned: 0,
                        }),
                    );
                }
            }
        }
        byCategory.sort((a, b) => b.spent - a.spent);

        const plannedByCategory: BudgetSpendingCategoryEntity[] = [];
        for (const [catId, rawPlanned] of plannedByCategoryMap.entries()) {
            const planned = Math.round(rawPlanned * 100) / 100;
            if (catId === null || planned <= 0) continue;
            const cat = categoryMap.get(catId);
            if (!cat) continue;
            plannedByCategory.push(
                new BudgetSpendingCategoryEntity({
                    categoryId: catId,
                    name: cat.name,
                    hexColor: cat.hexColor,
                    icon: cat.icon,
                    spent: 0,
                    planned,
                }),
            );
        }
        plannedByCategory.sort((a, b) => b.planned - a.planned);

        const totalSpent = Math.round(byCategory.reduce((sum, c) => sum + c.spent, 0) * 100) / 100;
        const totalPlanned = Math.round(plannedByCategory.reduce((sum, c) => sum + c.planned, 0) * 100) / 100;
        const actualIncome = Math.round(incomeTransactions.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

        return new BudgetSpendingEntity({totalSpent, totalPlanned, actualIncome, byCategory, plannedByCategory});
    }

    async getPlannedForAccounts(
        user: UserEntity,
        dto: GetPlannedByAccountsDto,
    ): Promise<BudgetSpendingCategoryEntity[]> {
        this.validateMonthAndYear(dto.year, dto.month);

        const uniqueAccountIds = Array.from(new Set(dto.accountIds));
        const accessMap = await this.accountAccess.getAccessMap(user, uniqueAccountIds);
        if (accessMap.size !== uniqueAccountIds.length) {
            throw new BadRequestException("One or more accounts are not accessible");
        }

        const accounts = await this.prismaService.accounts.findMany({
            where: {id: {in: uniqueAccountIds}},
            select: {id: true, user_id: true},
        });
        const ownerIds = new Set(accounts.map((a) => a.user_id));
        if (ownerIds.size !== 1) {
            throw new BadRequestException("All accounts must belong to the same owner");
        }

        const plannedByCategoryMap = await this.recurringTransactionService.getPlannedByCategoryForMonth(
            user,
            dto.year,
            dto.month,
            uniqueAccountIds,
        );

        const categoryIds = [...plannedByCategoryMap.keys()].filter((id): id is string => id !== null);
        const categories = categoryIds.length
            ? await this.prismaService.userCategories.findMany({
                  where: {id: {in: categoryIds}},
                  select: {id: true, name: true, hex_color: true, icon: true},
              })
            : [];
        const categoryMap = new Map(categories.map((c) => [c.id, {name: c.name, hexColor: c.hex_color, icon: c.icon}]));

        const result: BudgetSpendingCategoryEntity[] = [];
        for (const [catId, rawPlanned] of plannedByCategoryMap.entries()) {
            const planned = Math.round(rawPlanned * 100) / 100;
            if (catId === null || planned <= 0) continue;
            const cat = categoryMap.get(catId);
            if (!cat) continue;
            result.push(
                new BudgetSpendingCategoryEntity({
                    categoryId: catId,
                    name: cat.name,
                    hexColor: cat.hexColor,
                    icon: cat.icon,
                    spent: 0,
                    planned,
                }),
            );
        }
        result.sort((a, b) => b.planned - a.planned);
        return result;
    }

    async getRenewableBudgets(user: UserEntity): Promise<RenewableBudget[]> {
        // Only budgets the user can actually copy from show up: owner or full
        // write access on every account. Fetch the write set once and let the
        // DB filter out anything that has a non-writable account, so we never
        // pay the "load then filter" tax we used to.
        const writableAccountIds = await this.accountAccess.getAccessibleAccountIds(user, "write");

        const candidates = await this.prismaService.budgets.findMany({
            where: {
                OR: [
                    {user_id: user.id},
                    {
                        AND: [
                            {accounts: {some: {account_id: {in: writableAccountIds}}}},
                            {NOT: {accounts: {some: {account_id: {notIn: writableAccountIds}}}}},
                        ],
                    },
                ],
            },
            select: {
                id: true,
                name: true,
                month: true,
                year: true,
                user_id: true,
                accounts: {select: {account_id: true}},
            },
        });

        return candidates
            .filter((budget) => budget.user_id === user.id || budget.accounts.length > 0)
            .map<RenewableBudget>((budget) => ({
                id: budget.id,
                month: budget.month,
                year: budget.year,
                name: budget.name,
                effectivePermission: budget.user_id === user.id ? "owner" : "write",
            }))
            .sort((a, b) => {
                if (a.year !== b.year) return b.year - a.year;
                if (a.month !== b.month) return b.month - a.month;
                return (a.name ?? "").localeCompare(b.name ?? "");
            });
    }

    private async getBudgetAndPermissionOrThrow(
        user: UserEntity,
        budgetId: string,
        min: "read" | "write",
    ): Promise<{budget: BudgetWithRelations; permission: AccessLevel}> {
        const budget = await this.prismaService.budgets.findUnique({
            where: {id: budgetId},
            include: {
                budgeted_categories: {include: BUDGETED_CATEGORY_INCLUDE},
                accounts: {select: {account_id: true}},
            },
        });
        if (!budget) throw new NotFoundException("Budget not found");

        const permission = await this.resolveEffectivePermission(user, budget);
        if (permission === null) {
            throw new ForbiddenException("You do not have permission to access this budget");
        }
        if (min === "write" && permission === "read") {
            throw new ForbiddenException("You do not have permission to modify this budget");
        }
        return {budget, permission};
    }

    private async resolveEffectivePermission(
        user: UserEntity,
        budget: BudgetWithRelations,
        tx?: TxClient,
    ): Promise<AccessLevel | null> {
        if (budget.user_id === user.id) return "owner";
        const accountIds = budget.accounts.map((a) => a.account_id);
        if (accountIds.length === 0) return null;

        const accessMap = await this.accountAccess.getAccessMap(user, accountIds, tx);
        if (accessMap.size !== accountIds.length) return null;

        let hasRead = false;
        for (const level of accessMap.values()) {
            if (level === "read") hasRead = true;
        }
        return hasRead ? "read" : "write";
    }

    private toBudgetEntity(budget: BudgetWithRelations, effectivePermission: AccessLevel): BudgetEntity {
        return new BudgetEntity({
            id: budget.id,
            userId: budget.user_id,
            name: budget.name,
            month: budget.month,
            year: budget.year,
            budgetedIncome: budget.budgeted_income,
            accountIds: budget.accounts.map((a) => a.account_id),
            effectivePermission,
            createdAt: budget.created_at,
            updatedAt: budget.updated_at,
            budgetedCategories: budget.budgeted_categories.map((bc) => this.toBudgetedCategoryEntity(bc)),
        });
    }

    private toBudgetedCategoryEntity(bc: BudgetedCategoryWithCategory): BudgetedCategoryEntity {
        return new BudgetedCategoryEntity({
            budgetId: bc.budget_id,
            categoryId: bc.category_id,
            amount: bc.amount,
            name: bc.category.name,
            hexColor: bc.category.hex_color,
            icon: bc.category.icon,
            createdAt: bc.created_at,
            updatedAt: bc.updated_at,
        });
    }

    private async validateCategoriesBelongToOwner(ownerUserId: string, categoryIds: string[]): Promise<void> {
        if (categoryIds.length === 0) return;

        const categories: UserCategories[] | null = await this.prismaService.userCategories.findMany({
            where: {
                id: {in: categoryIds},
                user_id: ownerUserId,
            },
        });

        const foundIds = new Set(categories.map((c) => c.id));
        const missing = categoryIds.filter((id) => !foundIds.has(id));

        if (missing.length > 0) {
            throw new BadRequestException("One or more categories do not belong to the budget owner or do not exist");
        }
    }

    private validateUniqueCategoryIds(categoryIds: string[]): void {
        const uniqueCategoryIds = new Set(categoryIds);
        if (uniqueCategoryIds.size !== categoryIds.length) {
            throw new BadRequestException("Each category can only be used once per budget");
        }
    }

    private validateMonthAndYear(year: number, month: number): void {
        if (month < 1 || month > 12) throw new BadRequestException("Month must be between 1 and 12");
        if (year < 1 || year > 9999) throw new BadRequestException("Year must be between 1 and 9999");
    }
}
