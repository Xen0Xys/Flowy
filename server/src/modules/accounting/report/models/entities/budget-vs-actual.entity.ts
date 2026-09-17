export class BudgetVsActualPointEntity {
    year!: number;
    month!: number;
    period!: string;
    budgetedIncome!: number;
    budgetedExpense!: number;
    actualIncome!: number;
    actualExpense!: number;

    constructor(partial: Partial<BudgetVsActualPointEntity>) {
        Object.assign(this, partial);
    }
}
