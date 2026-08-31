export class MerchantEntity {
    id: string;
    userId: string;
    name: string;
    keywords: string[];
    primaryKeyword: string | null;
    autoCompleteEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;

    constructor(partial: Partial<MerchantEntity>) {
        Object.assign(this, partial);
    }
}
