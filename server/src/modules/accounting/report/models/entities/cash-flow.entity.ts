export class CashFlowPointEntity {
    period!: string;
    income!: number;
    expense!: number;
    net!: number;
    previousIncome?: number;
    previousExpense?: number;
    previousNet?: number;

    constructor(partial: Partial<CashFlowPointEntity>) {
        Object.assign(this, partial);
    }
}
