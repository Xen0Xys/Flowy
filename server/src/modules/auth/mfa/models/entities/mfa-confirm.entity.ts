export class MfaConfirmEntity {
    token: string | null;
    backupCodes: string[] | null;

    constructor(partial: Partial<MfaConfirmEntity>) {
        Object.assign(this, partial);
    }
}
