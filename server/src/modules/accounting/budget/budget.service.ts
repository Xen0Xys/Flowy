import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import {PrismaService} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {BudgetEntity} from "./models/entities/budget.entity";
import {BudgetedCategoryEntity} from "./models/entities/budgeted-category.entity";
import {BudgetSpendingCategoryEntity, BudgetSpendingEntity} from "./models/entities/budget-spending.entity";
import type {AvailableMonth} from "./models/entities/budget-spending.entity";
import {CreateBudgetDto} from "./models/dto/create-budget.dto";
import {UpdateBudgetDto} from "./models/dto/update-budget.dto";
import {BudgetedCategories, Budgets, Prisma} from "../../../../prisma/generated/client";

type BudgetWithCategories = Budgets & {
    budgeted_categories: BudgetedCategories[];
};

@Injectable()
export class BudgetService {
    private readonly logger = new Logger(BudgetService.name);

    constructor(private readonly prismaService: PrismaService) {}

    async getBudgetByPeriod(user: UserEntity, year: number, month: number): Promise<BudgetEntity | null> {
        this.validateMonthAndYear(year, month);
        const budget = await this.prismaService.budgets.findUnique({
            where: {
                user_id_month_year: {
                    user_id: user.id,
                    month,
                    year,
                },
            },
            include: {
                budgeted_categories: true,
            },
        });

        if (!budget) {
            return null;
        }

        return this.toBudgetEntity(budget);
    }

    async createBudget(user: UserEntity, dto: CreateBudgetDto): Promise<BudgetEntity> {
        const categoryIds = dto.categories.map((c) => c.categoryId);
        await this.validateCategoriesBelongToUser(user, categoryIds);

        try {
            const budget = await this.prismaService.budgets.create({
                data: {
                    user_id: user.id,
                    month: dto.month,
                    year: dto.year,
                    budgeted_income: dto.budgetedIncome,
                    budgeted_categories: {
                        create: dto.categories.map((c) => ({
                            category_id: c.categoryId,
                            amount: c.amount,
                        })),
                    },
                },
                include: {
                    budgeted_categories: true,
                },
            });

            return this.toBudgetEntity(budget);
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && error.code === "P2002") {
                throw new ConflictException("Budget already exists for this month and year");
            }
            throw error;
        }
    }

    async updateBudget(user: UserEntity, budgetId: string, dto: UpdateBudgetDto): Promise<BudgetEntity> {
        await this.getBudgetOrThrow(user, budgetId);

        const categoryIds = dto.categories?.map((c) => c.categoryId) ?? [];
        if (categoryIds.length > 0) {
            await this.validateCategoriesBelongToUser(user, categoryIds);
        }

        try {
            const budget = await this.prismaService.$transaction(async (tx) => {
                const prisma = this.prismaService.withTx(tx);

                const updatedBudget = await prisma.budgets.update({
                    where: {id: budgetId},
                    data: {
                        ...(dto.month !== undefined ? {month: dto.month} : {}),
                        ...(dto.year !== undefined ? {year: dto.year} : {}),
                        ...(dto.budgetedIncome !== undefined ? {budgeted_income: dto.budgetedIncome} : {}),
                    },
                    include: {
                        budgeted_categories: true,
                    },
                });

                if (dto.categories !== undefined) {
                    await prisma.budgetedCategories.deleteMany({
                        where: {budget_id: budgetId},
                    });

                    if (dto.categories.length > 0) {
                        await prisma.budgetedCategories.createMany({
                            data: dto.categories.map((c) => ({
                                budget_id: budgetId,
                                category_id: c.categoryId,
                                amount: c.amount,
                            })),
                        });
                    }

                    const refreshed = await prisma.budgets.findUnique({
                        where: {id: budgetId},
                        include: {
                            budgeted_categories: true,
                        },
                    });

                    return refreshed!;
                }

                return updatedBudget;
            });

            return this.toBudgetEntity(budget);
        } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                throw new ConflictException("Budget already exists for this month and year");
            }
            throw error;
        }
    }

    async deleteBudget(user: UserEntity, budgetId: string): Promise<void> {
        await this.getBudgetOrThrow(user, budgetId);

        await this.prismaService.budgets.delete({
            where: {id: budgetId},
        });
    }

    async getSpending(user: UserEntity, year: number, month: number): Promise<BudgetSpendingEntity> {
        this.validateMonthAndYear(year, month);

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);

        const userAccountIds = await this.prismaService.accounts
            .findMany({
                where: {user_id: user.id},
                select: {id: true},
            })
            .then((accounts) => accounts.map((a) => a.id));

        if (userAccountIds.length === 0) {
            return new BudgetSpendingEntity({totalSpent: 0, actualIncome: 0, byCategory: []});
        }

        const expenseTransactions = await this.prismaService.transactions.findMany({
            where: {
                account_id: {in: userAccountIds},
                amount: {lt: 0},
                date: {gte: startDate, lte: endDate},
            },
            select: {
                category_id: true,
                amount: true,
            },
        });

        const incomeTransactions = await this.prismaService.transactions.findMany({
            where: {
                account_id: {in: userAccountIds},
                amount: {gt: 0},
                date: {gte: startDate, lte: endDate},
            },
            select: {
                amount: true,
            },
        });

        const categorySpending = new Map<string | null, number>();
        for (const tx of expenseTransactions) {
            const key = tx.category_id;
            categorySpending.set(key, (categorySpending.get(key) ?? 0) + Math.abs(tx.amount));
        }

        const categoryIds = [...new Set([...categorySpending.keys()].filter((id): id is string => id !== null))];
        const categories =
            categoryIds.length > 0
                ? await this.prismaService.userCategories.findMany({
                      where: {id: {in: categoryIds}},
                      select: {id: true, name: true, hex_color: true, icon: true},
                  })
                : [];

        const categoryMap = new Map(categories.map((c) => [c.id, {name: c.name, hexColor: c.hex_color, icon: c.icon}]));

        const byCategory: BudgetSpendingCategoryEntity[] = [];

        for (const [catId, spent] of categorySpending.entries()) {
            if (catId === null) {
                byCategory.push(
                    new BudgetSpendingCategoryEntity({
                        categoryId: null,
                        hexColor: "#94a3b8",
                        icon: "iconoir:question-mark",
                        spent: Math.round(spent * 100) / 100,
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
                            spent: Math.round(spent * 100) / 100,
                        }),
                    );
                }
            }
        }

        byCategory.sort((a, b) => b.spent - a.spent);

        const totalSpent = Math.round(byCategory.reduce((sum, c) => sum + c.spent, 0) * 100) / 100;
        const actualIncome = Math.round(incomeTransactions.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

        return new BudgetSpendingEntity({totalSpent, actualIncome, byCategory});
    }

    async getAvailableMonths(user: UserEntity): Promise<AvailableMonth[]> {
        const months = await this.prismaService.budgets.findMany({
            where: {user_id: user.id},
            select: {month: true, year: true},
            distinct: ["month", "year"],
            orderBy: [{year: "desc"}, {month: "desc"}],
        });

        return months.map((m) => ({month: m.month, year: m.year}));
    }

    private toBudgetEntity(budget: BudgetWithCategories): BudgetEntity {
        return new BudgetEntity({
            id: budget.id,
            userId: budget.user_id,
            month: budget.month,
            year: budget.year,
            budgetedIncome: budget.budgeted_income,
            createdAt: budget.created_at,
            updatedAt: budget.updated_at,
            budgetedCategories: budget.budgeted_categories.map((bc) => this.toBudgetedCategoryEntity(bc)),
        });
    }

    private toBudgetedCategoryEntity(bc: BudgetedCategories): BudgetedCategoryEntity {
        return new BudgetedCategoryEntity({
            budgetId: bc.budget_id,
            categoryId: bc.category_id,
            amount: bc.amount,
            createdAt: bc.created_at,
            updatedAt: bc.updated_at,
        });
    }

    private async getBudgetOrThrow(user: UserEntity, budgetId: string): Promise<Budgets> {
        const budget = await this.prismaService.budgets.findUnique({
            where: {id: budgetId},
        });

        if (!budget) {
            throw new NotFoundException("Budget not found");
        }

        if (budget.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to access this budget");
        }

        return budget;
    }

    private async validateCategoriesBelongToUser(user: UserEntity, categoryIds: string[]): Promise<void> {
        if (categoryIds.length === 0) return;

        const categories = await this.prismaService.userCategories.findMany({
            where: {
                id: {in: categoryIds},
                user_id: user.id,
            },
        });

        const foundIds = new Set(categories.map((c) => c.id));
        const missing = categoryIds.filter((id) => !foundIds.has(id));

        if (missing.length > 0) {
            throw new BadRequestException("One or more categories do not belong to the user or do not exist");
        }
    }

    private validateMonthAndYear(year: number, month: number): void {
        if (month < 1 || month > 12) throw new BadRequestException("Month must be between 1 and 12");
        if (year < 1 || year > 9999) throw new BadRequestException("Year must be between 1 and 9999");
    }
}
