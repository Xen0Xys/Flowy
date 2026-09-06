import {BudgetedCategoryEntity} from "./budgeted-category.entity";
import type {AccessLevel} from "../../../account/account-access.service";

export class BudgetEntity {
    id!: string;
    userId!: string;
    name!: string | null;
    month!: number;
    year!: number;
    budgetedIncome!: number;
    accountIds!: string[];
    effectivePermission!: AccessLevel;
    createdAt!: Date;
    updatedAt!: Date;
    budgetedCategories?: BudgetedCategoryEntity[];

    constructor(partial: Partial<BudgetEntity>) {
        Object.assign(this, partial);
    }
}
