import {ApiProperty} from "@nestjs/swagger";

export class TransactionSummaryEntity {
    @ApiProperty({example: 42, description: "Number of transactions matching the filters, excluding rebalances"})
    count!: number;

    @ApiProperty({example: 3200.5, description: "Sum of positive amounts, excluding rebalances"})
    income!: number;

    @ApiProperty({example: -1850.2, description: "Sum of negative amounts, excluding rebalances (negative value)"})
    expense!: number;

    @ApiProperty({example: 1350.3, description: "income + expense"})
    net!: number;

    @ApiProperty({example: 2, description: "Number of rebalance transactions matching the filters"})
    rebalanceCount!: number;

    @ApiProperty({example: 15.5, description: "Sum of rebalance transaction amounts"})
    rebalanceNet!: number;

    constructor(partial: Partial<TransactionSummaryEntity>) {
        Object.assign(this, partial);
    }
}
