import {CreateTransactionDto} from "../dto/create-transaction.dto";

export class BulkAnalysisAccountEntity {
    id!: string;
    balance!: number;

    constructor(partial: Partial<BulkAnalysisAccountEntity>) {
        Object.assign(this, partial);
    }
}

export class BulkAnalysisEntity {
    account!: BulkAnalysisAccountEntity;
    toInsert!: CreateTransactionDto[];
    duplicates!: CreateTransactionDto[];

    constructor(partial: Partial<BulkAnalysisEntity>) {
        Object.assign(this, partial);
    }
}
