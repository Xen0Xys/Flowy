export class MfaConfirmEntity {
    token: string;
    backupCodes: string[];

    constructor(partial: Partial<MfaConfirmEntity>) {
        Object.assign(this, partial);
    }
}
