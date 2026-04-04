import {Faker} from "@faker-js/faker";
import {PrismaClient} from "../generated/client";

const MIN_BUDGETS_PER_USER = 1;
const MAX_BUDGETS_PER_USER = 3;
const MIN_BUDGETED_INCOME = 1500;
const MAX_BUDGETED_INCOME = 15000;
const MIN_BUDGET_LINES = 1;

type SeedCategoryRef = {
    id: string;
};

type SeedBudgetResult = {
    budgetsCount: number;
    budgetedCategoriesCount: number;
};

function distinctRecentPeriods(count: number, faker: Faker): Array<{year: number; month: number}> {
    const periods = new Map<string, {year: number; month: number}>();

    while (periods.size < count) {
        const monthsBack = faker.number.int({min: 0, max: 11});
        const date = new Date();
        date.setMonth(date.getMonth() - monthsBack);

        const period = {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
        };

        periods.set(`${period.year}-${period.month}`, period);
    }

    return [...periods.values()];
}

function pickUniqueCategoryIds(categories: SeedCategoryRef[], count: number, faker: Faker): string[] {
    return faker.helpers.shuffle(categories.map((category) => category.id)).slice(0, count);
}

export async function seedBudgetsForUser(
    prisma: PrismaClient,
    userId: string,
    categories: SeedCategoryRef[],
    faker: Faker,
): Promise<SeedBudgetResult> {
    if (categories.length === 0) {
        return {
            budgetsCount: 0,
            budgetedCategoriesCount: 0,
        };
    }

    const budgetsToCreate = faker.number.int({
        min: MIN_BUDGETS_PER_USER,
        max: MAX_BUDGETS_PER_USER,
    });

    const periods = distinctRecentPeriods(budgetsToCreate, faker);
    let budgetsCount = 0;
    let budgetedCategoriesCount = 0;

    await prisma.$transaction(async (tx) => {
        for (const period of periods) {
            const budgetedIncome = faker.number.float({
                min: MIN_BUDGETED_INCOME,
                max: MAX_BUDGETED_INCOME,
                fractionDigits: 2,
            });

            const budget = await tx.budgets.upsert({
                where: {
                    user_id_month_year: {
                        user_id: userId,
                        month: period.month,
                        year: period.year,
                    },
                },
                create: {
                    user_id: userId,
                    month: period.month,
                    year: period.year,
                    budgeted_income: budgetedIncome,
                },
                update: {
                    budgeted_income: budgetedIncome,
                },
                select: {
                    id: true,
                },
            });

            budgetsCount += 1;

            await tx.budgetedCategories.deleteMany({
                where: {
                    budget_id: budget.id,
                },
            });

            const maxBudgetLines = Math.min(categories.length, 8);
            const linesCount = faker.number.int({
                min: Math.min(MIN_BUDGET_LINES, maxBudgetLines),
                max: maxBudgetLines,
            });

            const selectedCategoryIds = pickUniqueCategoryIds(categories, linesCount, faker);

            if (selectedCategoryIds.length > 0) {
                await tx.budgetedCategories.createMany({
                    data: selectedCategoryIds.map((categoryId) => ({
                        budget_id: budget.id,
                        category_id: categoryId,
                        amount: faker.number.float({
                            min: 30,
                            max: 2000,
                            fractionDigits: 2,
                        }),
                    })),
                });

                budgetedCategoriesCount += selectedCategoryIds.length;
            }
        }
    });

    return {
        budgetsCount,
        budgetedCategoriesCount,
    };
}
