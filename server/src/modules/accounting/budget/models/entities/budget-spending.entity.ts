export class BudgetSpendingCategoryEntity {
    categoryId!: string | null;
    name?: string;
    hexColor!: string;
    icon!: string;
    spent!: number;

    constructor(partial: Partial<BudgetSpendingCategoryEntity>) {
        Object.assign(this, partial);
    }
}

export class BudgetSpendingEntity {
    totalSpent!: number;
    actualIncome!: number;
    byCategory!: BudgetSpendingCategoryEntity[];

    constructor(partial: Partial<BudgetSpendingEntity>) {
        Object.assign(this, partial);
    }
}

export type AvailableMonth = {
    month: number;
    year: number;
};
