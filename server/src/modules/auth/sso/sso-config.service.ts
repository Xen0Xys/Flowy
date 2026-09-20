import {Injectable, Logger, OnModuleInit} from "@nestjs/common";
import Joi from "joi";

export type SsoProviderKind = "oidc" | "oauth2";

export interface SsoProviderConfig {
    slug: string;
    kind: SsoProviderKind;
    displayName: string;
    icon: string;
    clientId: string;
    clientSecret: string;
    scopes: string[];
    allowSignup: boolean;
    allowedEmailDomains: string[];

    // OIDC only
    discoveryUrl?: string;

    // OAuth2 only
    authorizationUrl?: string;
    tokenUrl?: string;
    userinfoUrl?: string;
    emailsUrl?: string;
    emailClaim?: string;
    usernameClaim?: string;
    subClaim?: string;
}

interface RawProvider {
    index: number;
    fields: Record<string, string>;
}

const commonSchema = {
    kind: Joi.string().valid("oidc", "oauth2").required(),
    slug: Joi.string()
        .pattern(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/)
        .required()
        .messages({
            "string.pattern.base":
                "slug must be lowercase alphanumeric with optional hyphens (1-64 chars, cannot start or end with hyphen)",
        }),
    displayName: Joi.string().min(1).max(64).required(),
    icon: Joi.string().min(1).max(128).required(),
    clientId: Joi.string().min(1).required(),
    clientSecret: Joi.string().min(1).required(),
    scopes: Joi.array().items(Joi.string().min(1)).min(1).required(),
    allowSignup: Joi.boolean().default(true),
    allowedEmailDomains: Joi.array().items(Joi.string().min(1)).default([]),
};

const oidcSchema = Joi.object({
    ...commonSchema,
    discoveryUrl: Joi.string()
        .uri({scheme: ["http", "https"]})
        .required(),
});

const oauth2Schema = Joi.object({
    ...commonSchema,
    authorizationUrl: Joi.string()
        .uri({scheme: ["http", "https"]})
        .required(),
    tokenUrl: Joi.string()
        .uri({scheme: ["http", "https"]})
        .required(),
    userinfoUrl: Joi.string()
        .uri({scheme: ["http", "https"]})
        .required(),
    emailsUrl: Joi.string()
        .uri({scheme: ["http", "https"]})
        .optional(),
    emailClaim: Joi.string().min(1).required(),
    usernameClaim: Joi.string().min(1).required(),
    subClaim: Joi.string().min(1).required(),
});

function parseCsv(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    return fallback;
}

@Injectable()
export class SsoConfigService implements OnModuleInit {
    private readonly logger = new Logger(SsoConfigService.name);
    private providers: SsoProviderConfig[] = [];
    private providersBySlug = new Map<string, SsoProviderConfig>();
    private frontendUrlValue = "";

    onModuleInit(): void {
        this.providers = this.loadProviders();
        this.providersBySlug = new Map(this.providers.map((provider) => [provider.slug, provider]));
        this.frontendUrlValue = this.resolveFrontendUrl();
        if (this.providers.length > 0) {
            this.logger.log(
                `SSO providers loaded: ${this.providers.map((provider) => `${provider.slug}(${provider.kind})`).join(", ")}`,
            );
        } else {
            this.logger.log("No SSO providers configured");
        }
    }

    getEnabledProviders(): SsoProviderConfig[] {
        return this.providers.slice();
    }

    getProvider(slug: string): SsoProviderConfig | null {
        return this.providersBySlug.get(slug) ?? null;
    }

    frontendUrl(): string {
        return this.frontendUrlValue;
    }

    callbackUrl(slug: string): string {
        const base = this.serverOrigin();
        return `${base}/auth/sso/${encodeURIComponent(slug)}/callback`;
    }

    frontendRedirectUrl(path: string, query: Record<string, string> = {}): string {
        const base = this.frontendUrlValue.replace(/\/+$/, "");
        const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
        for (const [key, value] of Object.entries(query)) {
            url.searchParams.set(key, value);
        }
        return url.toString();
    }

    private serverOrigin(): string {
        const explicit = process.env.SSO_CALLBACK_BASE_URL?.trim();
        if (explicit) return explicit.replace(/\/+$/, "");
        const port = process.env.PORT ?? "4000";
        const prefix = process.env.PREFIX ?? "";
        const suffix = prefix ? (prefix.startsWith("/") ? prefix : `/${prefix}`) : "";
        return `http://localhost:${port}${suffix}`.replace(/\/+$/, "");
    }

    private resolveFrontendUrl(): string {
        const explicit = process.env.FRONTEND_URL?.trim();
        if (explicit) return explicit.replace(/\/+$/, "");
        if (this.providers.length > 0) {
            throw new Error("FRONTEND_URL must be defined when at least one SSO provider is configured");
        }
        return "";
    }

    private loadProviders(): SsoProviderConfig[] {
        const raw = this.collectRawProviders();
        const parsed: SsoProviderConfig[] = [];
        const slugsSeen = new Set<string>();

        for (const {index, fields} of raw) {
            const kind = (fields["KIND"] ?? "").trim().toLowerCase();
            const draft: Record<string, unknown> = {
                kind,
                slug: fields["SLUG"]?.trim().toLowerCase(),
                displayName: fields["DISPLAY_NAME"]?.trim(),
                icon: fields["ICON"]?.trim(),
                clientId: fields["CLIENT_ID"]?.trim(),
                clientSecret: fields["CLIENT_SECRET"],
                scopes: parseCsv(fields["SCOPES"] ?? this.defaultScopesFor(kind)),
                allowSignup: parseBool(fields["ALLOW_SIGNUP"], true),
                allowedEmailDomains: parseCsv(fields["ALLOWED_EMAIL_DOMAINS"]).map((domain) => domain.toLowerCase()),
            };

            if (kind === "oidc") {
                draft.discoveryUrl = fields["DISCOVERY_URL"]?.trim();
            } else if (kind === "oauth2") {
                draft.authorizationUrl = fields["AUTHORIZATION_URL"]?.trim();
                draft.tokenUrl = fields["TOKEN_URL"]?.trim();
                draft.userinfoUrl = fields["USERINFO_URL"]?.trim();
                draft.emailsUrl = fields["EMAILS_URL"]?.trim() || undefined;
                draft.emailClaim = fields["EMAIL_CLAIM"]?.trim();
                draft.usernameClaim = fields["USERNAME_CLAIM"]?.trim();
                draft.subClaim = fields["SUB_CLAIM"]?.trim();
            }

            const schema = kind === "oidc" ? oidcSchema : kind === "oauth2" ? oauth2Schema : null;
            if (!schema) {
                throw new Error(
                    `SSO provider #${index}: SSO_${index}_KIND must be "oidc" or "oauth2" (got "${fields["KIND"] ?? ""}")`,
                );
            }

            const {error, value} = schema.validate(draft, {abortEarly: false, stripUnknown: true});
            if (error) {
                throw new Error(
                    `SSO provider #${index} (SSO_${index}_*) invalid configuration: ${error.details
                        .map((detail) => detail.message)
                        .join("; ")}`,
                );
            }

            const provider = value as SsoProviderConfig;
            if (slugsSeen.has(provider.slug)) {
                throw new Error(`SSO provider #${index}: slug "${provider.slug}" is already used by another provider`);
            }
            slugsSeen.add(provider.slug);
            parsed.push(provider);
        }

        return parsed;
    }

    private collectRawProviders(): RawProvider[] {
        const groups = new Map<number, Record<string, string>>();
        for (const [key, value] of Object.entries(process.env)) {
            if (typeof value !== "string") continue;
            const match = /^SSO_(\d+)_(.+)$/.exec(key);
            if (!match) continue;
            const index = Number.parseInt(match[1], 10);
            if (!Number.isFinite(index) || index <= 0) continue;
            const field = match[2].toUpperCase();
            if (!groups.has(index)) groups.set(index, {});
            groups.get(index)![field] = value;
        }
        return Array.from(groups.entries())
            .sort(([a], [b]) => a - b)
            .map(([index, fields]) => ({index, fields}));
    }

    private defaultScopesFor(kind: string): string {
        if (kind === "oidc") return "openid,email,profile";
        return "";
    }
}
