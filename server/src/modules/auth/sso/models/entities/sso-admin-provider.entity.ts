export class SsoAdminProviderEntity {
    slug: string;
    displayName: string;
    icon: string;
    kind: "oidc" | "oauth2";
    scopes: string[];
    allowSignup: boolean;
    allowedEmailDomains: string[];
    discoveryUrl?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    userinfoUrl?: string;
    emailsUrl?: string;
    callbackUrl: string;

    constructor(partial: Partial<SsoAdminProviderEntity>) {
        Object.assign(this, partial);
    }
}
