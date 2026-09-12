export class BudgetSpendingCategoryEntity {
    categoryId!: string | null;
    name?: string;
    hexColor!: string;
    icon!: string;
    spent!: number;
    planned!: number;

    constructor(partial: Partial<BudgetSpendingCategoryEntity>) {
        Object.assign(this, partial);
    }
}

export class BudgetSpendingEntity {
    totalSpent!: number;
    totalPlanned!: number;
    actualIncome!: number;
    byCategory!: BudgetSpendingCategoryEntity[];
    plannedByCategory!: BudgetSpendingCategoryEntity[];

    constructor(partial: Partial<BudgetSpendingEntity>) {
        Object.assign(this, partial);
    }
}

export type RenewableBudget = {
    id: string;
    month: number;
    year: number;
    name: string | null;
    effectivePermission: "owner" | "write";
};
