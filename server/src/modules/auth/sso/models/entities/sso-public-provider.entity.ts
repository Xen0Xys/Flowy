export class SsoPublicProviderEntity {
    slug: string;
    displayName: string;
    icon: string;

    constructor(partial: Partial<SsoPublicProviderEntity>) {
        Object.assign(this, partial);
    }
}
