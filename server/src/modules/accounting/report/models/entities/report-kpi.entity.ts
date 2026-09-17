export class ReportKpiPeriodEntity {
    income!: number;
    expense!: number;
    net!: number;
    savingsRate!: number;
    transactionCount!: number;

    constructor(partial: Partial<ReportKpiPeriodEntity>) {
        Object.assign(this, partial);
    }
}

export class ReportKpiEntity {
    current!: ReportKpiPeriodEntity;
    previous!: ReportKpiPeriodEntity;

    constructor(partial: Partial<ReportKpiEntity>) {
        Object.assign(this, partial);
    }
}
