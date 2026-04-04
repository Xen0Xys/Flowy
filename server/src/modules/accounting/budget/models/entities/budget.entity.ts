import {BudgetedCategoryEntity} from "./budgeted-category.entity";

export class BudgetEntity {
    id!: string;
    userId!: string;
    month!: number;
    year!: number;
    budgetedIncome!: number;
    createdAt!: Date;
    updatedAt!: Date;
    budgetedCategories?: BudgetedCategoryEntity[];

    constructor(partial: Partial<BudgetEntity>) {
        Object.assign(this, partial);
    }
}
