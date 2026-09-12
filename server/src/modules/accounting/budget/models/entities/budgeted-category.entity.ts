export class BudgetedCategoryEntity {
    budgetId!: string;
    categoryId!: string;
    amount!: number;
    name!: string;
    hexColor!: string;
    icon!: string;
    createdAt!: Date;
    updatedAt!: Date;

    constructor(partial: Partial<BudgetedCategoryEntity>) {
        Object.assign(this, partial);
    }
}
