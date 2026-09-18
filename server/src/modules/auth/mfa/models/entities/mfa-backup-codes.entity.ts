export class MfaBackupCodesEntity {
    codes: string[];

    constructor(partial: Partial<MfaBackupCodesEntity>) {
        Object.assign(this, partial);
    }
}
