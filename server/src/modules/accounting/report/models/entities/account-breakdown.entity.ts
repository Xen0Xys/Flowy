export class AccountBreakdownEntity {
    accountId!: string;
    name!: string;
    type!: string;
    ownerId!: string;
    ownerUsername!: string;
    access!: "owner" | "write" | "read";
    balance!: number;
    income!: number;
    expense!: number;

    constructor(partial: Partial<AccountBreakdownEntity>) {
        Object.assign(this, partial);
    }
}
