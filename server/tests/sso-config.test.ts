// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {afterEach, beforeEach, describe, expect, test} from "bun:test";
import {SsoConfigService} from "../src/modules/auth/sso/sso-config.service";

const TRACKED_KEY_PATTERN = /^SSO_/;
const TRACKED_KEYS = ["FRONTEND_URL", "BACKEND_URL", "PORT", "PREFIX"] as const;

function isTracked(key: string): boolean {
    if (TRACKED_KEY_PATTERN.test(key)) return true;
    return (TRACKED_KEYS as readonly string[]).includes(key);
}

function snapshotEnv(): Record<string, string | undefined> {
    const snap: Record<string, string | undefined> = {};
    for (const key of Object.keys(process.env)) {
        if (isTracked(key)) snap[key] = process.env[key];
    }
    return snap;
}

function clearTrackedEnv(): void {
    for (const key of Object.keys(process.env)) {
        if (isTracked(key)) delete process.env[key];
    }
}

function restoreEnv(snap: Record<string, string | undefined>): void {
    clearTrackedEnv();
    for (const [key, value] of Object.entries(snap)) {
        if (value !== undefined) process.env[key] = value;
    }
}

function init(): SsoConfigService {
    const service = new SsoConfigService();
    service.onModuleInit();
    return service;
}

describe("SsoConfigService", () => {
    let baseline: Record<string, string | undefined>;

    beforeEach(() => {
        baseline = snapshotEnv();
        clearTrackedEnv();
    });

    afterEach(() => {
        restoreEnv(baseline);
    });

    test("loads no providers when nothing is configured", () => {
        const service = init();
        expect(service.getEnabledProviders()).toEqual([]);
        expect(service.getProvider("unknown")).toBeNull();
        expect(service.frontendUrl()).toBe("");
    });

    test("groups SSO_<n>_* fields by index and loads OIDC + OAuth2 providers side by side", () => {
        process.env.FRONTEND_URL = "http://localhost:3000";
        process.env.SSO_1_KIND = "oidc";
        process.env.SSO_1_SLUG = "test-oidc";
        process.env.SSO_1_DISPLAY_NAME = "Test OIDC";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "client-1";
        process.env.SSO_1_CLIENT_SECRET = "secret-1";
        process.env.SSO_1_DISCOVERY_URL = "https://issuer.example.com/.well-known/openid-configuration";

        process.env.SSO_2_KIND = "oauth2";
        process.env.SSO_2_SLUG = "test-oauth2";
        process.env.SSO_2_DISPLAY_NAME = "Test OAuth2";
        process.env.SSO_2_ICON = "iconoir:github";
        process.env.SSO_2_CLIENT_ID = "client-2";
        process.env.SSO_2_CLIENT_SECRET = "secret-2";
        process.env.SSO_2_AUTHORIZATION_URL = "https://oauth.example.com/authorize";
        process.env.SSO_2_TOKEN_URL = "https://oauth.example.com/token";
        process.env.SSO_2_USERINFO_URL = "https://oauth.example.com/userinfo";
        process.env.SSO_2_SCOPES = "read:user, user:email";
        process.env.SSO_2_EMAIL_CLAIM = "email";
        process.env.SSO_2_USERNAME_CLAIM = "login";
        process.env.SSO_2_SUB_CLAIM = "id";

        const service = init();
        const providers = service.getEnabledProviders();
        expect(providers).toHaveLength(2);

        const oidc = service.getProvider("test-oidc");
        expect(oidc?.kind).toBe("oidc");
        expect(oidc?.scopes).toEqual(["openid", "email", "profile"]);
        expect(oidc?.discoveryUrl).toBe("https://issuer.example.com/.well-known/openid-configuration");
        expect(oidc?.allowSignup).toBe(true);
        expect(oidc?.allowedEmailDomains).toEqual([]);

        const oauth = service.getProvider("test-oauth2");
        expect(oauth?.kind).toBe("oauth2");
        expect(oauth?.scopes).toEqual(["read:user", "user:email"]);
        expect(oauth?.emailClaim).toBe("email");
        expect(oauth?.usernameClaim).toBe("login");
        expect(oauth?.subClaim).toBe("id");
        expect(oauth?.emailsUrl).toBeUndefined();
    });

    test("rejects an unknown KIND with an index-aware message", () => {
        process.env.SSO_1_KIND = "saml";
        process.env.SSO_1_SLUG = "bad";
        process.env.SSO_1_DISPLAY_NAME = "Bad";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "id";
        process.env.SSO_1_CLIENT_SECRET = "secret";
        expect(() => init()).toThrow(/SSO_1_KIND must be "oidc" or "oauth2"/);
    });

    test("rejects an OIDC provider missing discoveryUrl", () => {
        process.env.FRONTEND_URL = "http://localhost:3000";
        process.env.SSO_1_KIND = "oidc";
        process.env.SSO_1_SLUG = "no-discovery";
        process.env.SSO_1_DISPLAY_NAME = "No Discovery";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "id";
        process.env.SSO_1_CLIENT_SECRET = "secret";
        expect(() => init()).toThrow(/discoveryUrl/);
    });

    test("rejects an OAuth2 provider missing endpoints or claim mappings", () => {
        process.env.SSO_1_KIND = "oauth2";
        process.env.SSO_1_SLUG = "no-endpoints";
        process.env.SSO_1_DISPLAY_NAME = "No Endpoints";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "id";
        process.env.SSO_1_CLIENT_SECRET = "secret";
        process.env.SSO_1_SCOPES = "openid";
        expect(() => init()).toThrow(/authorizationUrl|tokenUrl|userinfoUrl|emailClaim|usernameClaim|subClaim/);
    });

    test("rejects an invalid slug", () => {
        process.env.FRONTEND_URL = "http://localhost:3000";
        process.env.SSO_1_KIND = "oidc";
        process.env.SSO_1_SLUG = "-invalid-";
        process.env.SSO_1_DISPLAY_NAME = "Bad Slug";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "id";
        process.env.SSO_1_CLIENT_SECRET = "secret";
        process.env.SSO_1_DISCOVERY_URL = "https://issuer.example.com/.well-known/openid-configuration";
        expect(() => init()).toThrow(/slug/);
    });

    test("rejects duplicate slugs across providers", () => {
        process.env.FRONTEND_URL = "http://localhost:3000";
        process.env.SSO_1_KIND = "oidc";
        process.env.SSO_1_SLUG = "shared";
        process.env.SSO_1_DISPLAY_NAME = "Shared 1";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "id1";
        process.env.SSO_1_CLIENT_SECRET = "secret1";
        process.env.SSO_1_DISCOVERY_URL = "https://issuer.example.com/.well-known/openid-configuration";

        process.env.SSO_2_KIND = "oidc";
        process.env.SSO_2_SLUG = "shared";
        process.env.SSO_2_DISPLAY_NAME = "Shared 2";
        process.env.SSO_2_ICON = "iconoir:key";
        process.env.SSO_2_CLIENT_ID = "id2";
        process.env.SSO_2_CLIENT_SECRET = "secret2";
        process.env.SSO_2_DISCOVERY_URL = "https://issuer.example.com/.well-known/openid-configuration";

        expect(() => init()).toThrow(/already used/);
    });

    test("parses ALLOW_SIGNUP truthy/falsy variants and lowercases allowed domains", () => {
        process.env.FRONTEND_URL = "http://localhost:3000";
        process.env.SSO_1_KIND = "oidc";
        process.env.SSO_1_SLUG = "domain-check";
        process.env.SSO_1_DISPLAY_NAME = "Domain Check";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "id";
        process.env.SSO_1_CLIENT_SECRET = "secret";
        process.env.SSO_1_DISCOVERY_URL = "https://issuer.example.com/.well-known/openid-configuration";
        process.env.SSO_1_ALLOW_SIGNUP = "off";
        process.env.SSO_1_ALLOWED_EMAIL_DOMAINS = "Example.COM, Corp.io";

        const service = init();
        const provider = service.getProvider("domain-check");
        expect(provider?.allowSignup).toBe(false);
        expect(provider?.allowedEmailDomains).toEqual(["example.com", "corp.io"]);
    });

    test("throws when providers are configured but FRONTEND_URL is missing", () => {
        process.env.SSO_1_KIND = "oidc";
        process.env.SSO_1_SLUG = "no-frontend";
        process.env.SSO_1_DISPLAY_NAME = "No Frontend";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "id";
        process.env.SSO_1_CLIENT_SECRET = "secret";
        process.env.SSO_1_DISCOVERY_URL = "https://issuer.example.com/.well-known/openid-configuration";
        expect(() => init()).toThrow(/FRONTEND_URL/);
    });

    test("callbackUrl honors BACKEND_URL, strips trailing slashes and encodes slug", () => {
        process.env.FRONTEND_URL = "http://localhost:3000";
        process.env.BACKEND_URL = "https://api.example.com/api/";
        process.env.SSO_1_KIND = "oidc";
        process.env.SSO_1_SLUG = "test-slug";
        process.env.SSO_1_DISPLAY_NAME = "Test";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "id";
        process.env.SSO_1_CLIENT_SECRET = "secret";
        process.env.SSO_1_DISCOVERY_URL = "https://issuer.example.com/.well-known/openid-configuration";
        const service = init();
        expect(service.callbackUrl("test-slug")).toBe("https://api.example.com/api/auth/sso/test-slug/callback");
    });

    test("callbackUrl falls back to PORT and PREFIX when BACKEND_URL is unset", () => {
        process.env.FRONTEND_URL = "http://localhost:3000";
        process.env.PORT = "5001";
        process.env.PREFIX = "api";
        process.env.SSO_1_KIND = "oidc";
        process.env.SSO_1_SLUG = "test-slug";
        process.env.SSO_1_DISPLAY_NAME = "Test";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "id";
        process.env.SSO_1_CLIENT_SECRET = "secret";
        process.env.SSO_1_DISCOVERY_URL = "https://issuer.example.com/.well-known/openid-configuration";
        const service = init();
        expect(service.callbackUrl("test-slug")).toBe("http://localhost:5001/api/auth/sso/test-slug/callback");
    });

    test("frontendRedirectUrl appends query parameters and tolerates a trailing slash", () => {
        process.env.FRONTEND_URL = "http://localhost:3000/";
        process.env.SSO_1_KIND = "oidc";
        process.env.SSO_1_SLUG = "test";
        process.env.SSO_1_DISPLAY_NAME = "Test";
        process.env.SSO_1_ICON = "iconoir:key";
        process.env.SSO_1_CLIENT_ID = "id";
        process.env.SSO_1_CLIENT_SECRET = "secret";
        process.env.SSO_1_DISCOVERY_URL = "https://issuer.example.com/.well-known/openid-configuration";
        const service = init();
        const url = service.frontendRedirectUrl("auth/sso/complete", {status: "ok", code: "email conflict"});
        const parsed = new URL(url);
        expect(parsed.origin + parsed.pathname).toBe("http://localhost:3000/auth/sso/complete");
        expect(parsed.searchParams.get("status")).toBe("ok");
        expect(parsed.searchParams.get("code")).toBe("email conflict");
    });
});
