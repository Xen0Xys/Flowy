import {AccountTypes} from "../../../../../prisma/generated/enums";

export class AccountEntity {
    id: string;
    ownerId: string;
    name: string;
    balance: number;
    type: AccountTypes;
    createdAt: Date;
    updatedAt: Date;

    constructor(partial: Partial<AccountEntity>) {
        Object.assign(this, partial);
    }
}
