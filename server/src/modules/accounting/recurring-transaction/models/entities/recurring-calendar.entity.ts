import {RecurringTransactionEntity} from "./recurring-transaction.entity";

export class RecurringCalendarOccurrenceEntity {
    recurringTransactionId!: string;
    scheduledFor!: Date;
    localDate!: string;

    constructor(partial: Partial<RecurringCalendarOccurrenceEntity>) {
        Object.assign(this, partial);
    }
}

export class RecurringCalendarEntity {
    year!: number;
    month!: number;
    occurrences!: RecurringCalendarOccurrenceEntity[];
    recurringTransactions!: RecurringTransactionEntity[];

    constructor(partial: Partial<RecurringCalendarEntity>) {
        Object.assign(this, partial);
    }
}
