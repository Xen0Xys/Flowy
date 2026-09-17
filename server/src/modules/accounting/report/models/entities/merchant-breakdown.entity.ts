export class MerchantBreakdownEntity {
    merchantId!: string | null;
    name!: string;
    spent!: number;
    count!: number;

    constructor(partial: Partial<MerchantBreakdownEntity>) {
        Object.assign(this, partial);
    }
}
