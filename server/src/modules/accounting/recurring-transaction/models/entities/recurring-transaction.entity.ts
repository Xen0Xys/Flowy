import {RecurrenceFrequency} from "../../../../../../prisma/generated/client";
import {MerchantEntity} from "../../../reference/models/entities/merchant.entity";
import {CategoryEntity} from "../../../reference/models/entities/category.entity";

export class RecurringTransactionEntity {
    id!: string;
    userId!: string;
    accountId!: string;
    name!: string;
    amount!: number;
    merchant?: MerchantEntity;
    category?: CategoryEntity;
    frequency!: RecurrenceFrequency;
    dayOfMonth!: number | null;
    dayOfWeek!: number | null;
    monthOfYear!: number | null;
    timezone!: string;
    inBudget!: boolean;
    isEnabled!: boolean;
    nextRunAt!: Date;
    lastRunAt!: Date | null;
    lastFailureAt!: Date | null;
    isFailing!: boolean;
    createdAt!: Date;
    updatedAt!: Date;

    constructor(partial: Partial<RecurringTransactionEntity>) {
        Object.assign(this, partial);
    }
}
