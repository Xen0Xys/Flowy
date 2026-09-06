import {AccountTypes} from "../../../../../../prisma/generated/enums";
import type {AccessLevel} from "../../account-access.service";

export class AccountEntity {
    id: string;
    ownerId: string;
    name: string;
    balance: number;
    type: AccountTypes;
    access: AccessLevel;
    sharesCount: number;
    createdAt: Date;
    updatedAt: Date;

    constructor(partial: Partial<AccountEntity>) {
        Object.assign(this, partial);
    }
}
