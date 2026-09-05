import {RecurringExecutionStatus} from "../../../../../../prisma/generated/client";

export class RecurringTransactionExecutionEntity {
    id!: string;
    recurringTransactionId!: string;
    transactionId!: string | null;
    status!: RecurringExecutionStatus;
    errorMessage!: string | null;
    scheduledFor!: Date;
    executedAt!: Date;

    constructor(partial: Partial<RecurringTransactionExecutionEntity>) {
        Object.assign(this, partial);
    }
}

export class ListExecutionsResultEntity {
    items!: RecurringTransactionExecutionEntity[];
    total!: number;
    page!: number;
    pageSize!: number;
    totalPages!: number;

    constructor(partial: Partial<ListExecutionsResultEntity>) {
        Object.assign(this, partial);
    }
}
