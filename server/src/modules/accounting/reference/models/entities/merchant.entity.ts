export class MerchantEntity {
    id: string;
    userId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;

    constructor(partial: Partial<MerchantEntity>) {
        Object.assign(this, partial);
    }
}
