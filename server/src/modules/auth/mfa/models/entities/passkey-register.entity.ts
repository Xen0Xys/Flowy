import {PasskeyEntity} from "./passkey.entity";

export class PasskeyRegisterEntity {
    passkey: PasskeyEntity;
    token: string | null;
    backupCodes: string[] | null;

    constructor(partial: Partial<PasskeyRegisterEntity>) {
        Object.assign(this, partial);
    }
}
