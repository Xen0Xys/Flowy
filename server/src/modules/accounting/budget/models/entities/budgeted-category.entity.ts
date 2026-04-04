export class BudgetedCategoryEntity {
    budgetId!: string;
    categoryId!: string;
    amount!: number;
    createdAt!: Date;
    updatedAt!: Date;

    constructor(partial: Partial<BudgetedCategoryEntity>) {
        Object.assign(this, partial);
    }
}
