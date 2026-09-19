import {Type} from "class-transformer";
import {TransactionEntity} from "./transaction.entity";

export class SearchTransactionsResultEntity {
    @Type(() => TransactionEntity)
    items!: TransactionEntity[];

    total!: number;

    page!: number;

    pageSize!: number;

    totalPages!: number;

    constructor(partial: Partial<SearchTransactionsResultEntity>) {
        Object.assign(this, partial);
    }
}
