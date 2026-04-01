import {ApiProperty} from "@nestjs/swagger";
import {Type} from "class-transformer";
import {TransactionEntity} from "./transaction.entity";

export class SearchTransactionsResultEntity {
    @ApiProperty({type: TransactionEntity, isArray: true})
    @Type(() => TransactionEntity)
    items!: TransactionEntity[];

    @ApiProperty({example: 42})
    total!: number;

    @ApiProperty({example: 1})
    page!: number;

    @ApiProperty({example: 25})
    pageSize!: number;

    @ApiProperty({example: 2})
    totalPages!: number;

    @ApiProperty({example: true})
    isPaginated!: boolean;

    constructor(partial: Partial<SearchTransactionsResultEntity>) {
        Object.assign(this, partial);
    }
}
