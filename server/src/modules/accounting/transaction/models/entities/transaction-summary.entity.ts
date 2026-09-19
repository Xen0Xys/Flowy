export class TransactionSummaryEntity {
    count!: number;

    income!: number;

    expense!: number;

    net!: number;

    rebalanceCount!: number;

    rebalanceNet!: number;

    constructor(partial: Partial<TransactionSummaryEntity>) {
        Object.assign(this, partial);
    }
}
