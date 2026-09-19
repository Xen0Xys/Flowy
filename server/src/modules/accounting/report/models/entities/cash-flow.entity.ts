export class CashFlowPointEntity {
    period!: string;
    income!: number;
    expense!: number;
    net!: number;
    savingsRate!: number;
    previousIncome?: number;
    previousExpense?: number;
    previousNet?: number;
    previousSavingsRate?: number;

    constructor(partial: Partial<CashFlowPointEntity>) {
        Object.assign(this, partial);
    }
}
