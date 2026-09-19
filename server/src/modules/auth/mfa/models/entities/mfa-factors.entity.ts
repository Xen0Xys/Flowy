export class MfaFactorsEntity {
    mfaEnabled: boolean;
    totpEnrolled: boolean;
    passkeyCount: number;
    unusedBackupCodes: number;

    constructor(partial: Partial<MfaFactorsEntity>) {
        Object.assign(this, partial);
    }
}
