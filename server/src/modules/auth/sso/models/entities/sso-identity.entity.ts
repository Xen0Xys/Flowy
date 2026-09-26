export class SsoIdentityEntity {
    id: string;
    providerSlug: string;
    providerDisplayName: string;
    providerIcon: string;
    emailAtLink: string | null;
    linkedAt: Date;
    lastLoginAt: Date | null;

    constructor(partial: Partial<SsoIdentityEntity>) {
        Object.assign(this, partial);
    }
}
