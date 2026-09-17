export class CashFlowPointEntity {
    period!: string;
    income!: number;
    expense!: number;
    net!: number;

    constructor(partial: Partial<CashFlowPointEntity>) {
        Object.assign(this, partial);
    }
}
