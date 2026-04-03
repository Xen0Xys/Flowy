import {MerchantEntity} from "../../../reference/models/entities/merchant.entity";
import {CategoryEntity} from "../../../reference/models/entities/category.entity";

export class TransactionEntity {
    id!: string;
    accountId!: string;
    amount!: number;
    description!: string;
    date!: Date;
    merchant!: MerchantEntity;
    category!: CategoryEntity;
    isRebalance!: boolean;
    linkedTransactionId?: string;
    createdAt!: Date;
    updatedAt!: Date;

    constructor(partial: Partial<TransactionEntity>) {
        Object.assign(this, partial);
    }
}
