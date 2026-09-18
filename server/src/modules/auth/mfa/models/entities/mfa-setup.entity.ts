export class MfaSetupEntity {
    secret: string;
    otpauthUrl: string;

    constructor(partial: Partial<MfaSetupEntity>) {
        Object.assign(this, partial);
    }
}
