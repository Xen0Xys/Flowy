import {AccountSharePermission} from "../../../../../../prisma/generated/enums";

export class AccountShareEntity {
    id!: string;
    accountId!: string;
    sharedWithId!: string;
    sharedWithUsername!: string;
    sharedWithEmail!: string;
    permission!: AccountSharePermission;
    createdAt!: Date;
    updatedAt!: Date;

    constructor(partial: Partial<AccountShareEntity>) {
        Object.assign(this, partial);
    }
}
