import {Injectable, Logger} from "@nestjs/common";
import * as openid from "openid-client";
import type {SsoProviderConfig} from "../sso-config.service";

export interface SsoNormalizedProfile {
    subject: string;
    email: string | null;
    username: string | null;
}

export interface OidcAuthorizationBundle {
    url: string;
    codeVerifier: string;
    nonce: string;
}

interface CachedConfig {
    config: openid.Configuration;
    fetchedAt: number;
}

const DISCOVERY_TTL_MS = 60 * 60 * 1000; // 1h

@Injectable()
export class OidcProviderService {
    private readonly logger = new Logger(OidcProviderService.name);
    private readonly cache = new Map<string, CachedConfig>();

    async buildAuthorizationUrl(
        provider: SsoProviderConfig,
        redirectUri: string,
        state: string,
    ): Promise<OidcAuthorizationBundle> {
        const config = await this.getConfig(provider);
        const codeVerifier = openid.randomPKCECodeVerifier();
        const codeChallenge = await openid.calculatePKCECodeChallenge(codeVerifier);
        const nonce = openid.randomNonce();

        const url = openid.buildAuthorizationUrl(config, {
            redirect_uri: redirectUri,
            scope: provider.scopes.join(" "),
            state,
            nonce,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
        });

        return {url: url.toString(), codeVerifier, nonce};
    }

    async exchangeCallback(
        provider: SsoProviderConfig,
        callbackUrl: URL,
        expectedState: string,
        codeVerifier: string,
        expectedNonce: string,
    ): Promise<SsoNormalizedProfile> {
        const config = await this.getConfig(provider);
        const tokens = await openid.authorizationCodeGrant(config, callbackUrl, {
            pkceCodeVerifier: codeVerifier,
            expectedState,
            expectedNonce: expectedNonce || undefined,
            idTokenExpected: true,
        });

        const claims = tokens.claims();
        if (!claims) {
            throw new Error(`OIDC provider ${provider.slug} returned no ID Token claims`);
        }

        const subject = typeof claims.sub === "string" ? claims.sub : null;
        if (!subject) {
            throw new Error(`OIDC provider ${provider.slug} returned no sub claim`);
        }

        let email: string | null = typeof claims.email === "string" ? claims.email : null;
        let username: string | null = null;
        if (typeof claims.preferred_username === "string") username = claims.preferred_username;
        else if (typeof claims.name === "string") username = claims.name;
        else if (typeof claims.nickname === "string") username = claims.nickname;

        // Some providers only expose email/username at the userinfo endpoint,
        // not in the ID Token. Fetch it if we're missing either.
        if (!email || !username) {
            try {
                const userinfo = await openid.fetchUserInfo(config, tokens.access_token, subject);
                if (!email && typeof userinfo.email === "string") email = userinfo.email;
                if (!username) {
                    if (typeof userinfo.preferred_username === "string") username = userinfo.preferred_username;
                    else if (typeof userinfo.name === "string") username = userinfo.name;
                    else if (typeof userinfo.nickname === "string") username = userinfo.nickname;
                }
            } catch (error) {
                this.logger.warn(
                    `OIDC provider ${provider.slug} userinfo fetch failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        return {
            subject,
            email: email?.toLowerCase() ?? null,
            username: username ?? null,
        };
    }

    private async getConfig(provider: SsoProviderConfig): Promise<openid.Configuration> {
        const cached = this.cache.get(provider.slug);
        if (cached && Date.now() - cached.fetchedAt < DISCOVERY_TTL_MS) {
            return cached.config;
        }
        if (!provider.discoveryUrl) {
            throw new Error(`OIDC provider ${provider.slug} has no discoveryUrl configured`);
        }
        const config = await openid.discovery(new URL(provider.discoveryUrl), provider.clientId, provider.clientSecret);
        this.cache.set(provider.slug, {config, fetchedAt: Date.now()});
        return config;
    }
}
