import {Injectable, Logger} from "@nestjs/common";
import crypto from "crypto";
import type {SsoProviderConfig} from "../sso-config.service";
import type {SsoNormalizedProfile} from "./oidc-provider.service";

export interface OAuth2AuthorizationBundle {
    url: string;
    codeVerifier: string;
}

interface TokenResponse {
    access_token?: string;
    token_type?: string;
    scope?: string;
    [key: string]: unknown;
}

function base64UrlEncode(buffer: Buffer): string {
    return buffer.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pickClaim(payload: unknown, path: string): unknown {
    if (!payload || typeof payload !== "object") return undefined;
    const parts = path.split(".");
    let cursor: any = payload;
    for (const part of parts) {
        if (cursor === null || cursor === undefined) return undefined;
        cursor = cursor[part];
    }
    return cursor;
}

@Injectable()
export class OAuth2ProviderService {
    private readonly logger = new Logger(OAuth2ProviderService.name);

    buildAuthorizationUrl(provider: SsoProviderConfig, redirectUri: string, state: string): OAuth2AuthorizationBundle {
        if (!provider.authorizationUrl || !provider.tokenUrl || !provider.userinfoUrl) {
            throw new Error(`OAuth2 provider ${provider.slug} is missing required endpoints`);
        }
        const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
        const codeChallenge = base64UrlEncode(crypto.createHash("sha256").update(codeVerifier).digest());

        const url = new URL(provider.authorizationUrl);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", provider.clientId);
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("scope", provider.scopes.join(" "));
        url.searchParams.set("state", state);
        url.searchParams.set("code_challenge", codeChallenge);
        url.searchParams.set("code_challenge_method", "S256");

        return {url: url.toString(), codeVerifier};
    }

    async exchangeCallback(
        provider: SsoProviderConfig,
        code: string,
        redirectUri: string,
        codeVerifier: string,
    ): Promise<SsoNormalizedProfile> {
        if (
            !provider.tokenUrl ||
            !provider.userinfoUrl ||
            !provider.emailClaim ||
            !provider.usernameClaim ||
            !provider.subClaim
        ) {
            throw new Error(`OAuth2 provider ${provider.slug} is missing required fields`);
        }
        const tokenParams = new URLSearchParams();
        tokenParams.set("grant_type", "authorization_code");
        tokenParams.set("code", code);
        tokenParams.set("redirect_uri", redirectUri);
        tokenParams.set("client_id", provider.clientId);
        tokenParams.set("client_secret", provider.clientSecret);
        tokenParams.set("code_verifier", codeVerifier);

        const tokenRes = await fetch(provider.tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: tokenParams.toString(),
        });
        if (!tokenRes.ok) {
            const text = await tokenRes.text().catch(() => "");
            throw new Error(
                `OAuth2 provider ${provider.slug} token exchange failed (${tokenRes.status}): ${text.slice(0, 200)}`,
            );
        }
        const tokens = (await tokenRes.json()) as TokenResponse;
        const accessToken = typeof tokens.access_token === "string" ? tokens.access_token : null;
        if (!accessToken) {
            throw new Error(`OAuth2 provider ${provider.slug} did not return an access_token`);
        }

        const userinfoRes = await fetch(provider.userinfoUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
                // GitHub requires a User-Agent header; harmless to send for others.
                "User-Agent": "Flowy-SSO",
            },
        });
        if (!userinfoRes.ok) {
            const text = await userinfoRes.text().catch(() => "");
            throw new Error(
                `OAuth2 provider ${provider.slug} userinfo failed (${userinfoRes.status}): ${text.slice(0, 200)}`,
            );
        }
        const userinfo = (await userinfoRes.json()) as unknown;

        const subjectRaw = pickClaim(userinfo, provider.subClaim);
        const subject = subjectRaw === null || subjectRaw === undefined ? null : String(subjectRaw);
        if (!subject) {
            throw new Error(`OAuth2 provider ${provider.slug} userinfo missing sub claim "${provider.subClaim}"`);
        }

        let email: string | null = null;
        const emailRaw = pickClaim(userinfo, provider.emailClaim);
        if (typeof emailRaw === "string" && emailRaw.length > 0) email = emailRaw;

        // Fallback endpoint (GitHub-style /user/emails)
        if (!email && provider.emailsUrl) {
            try {
                const emailsRes = await fetch(provider.emailsUrl, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: "application/json",
                        "User-Agent": "Flowy-SSO",
                    },
                });
                if (emailsRes.ok) {
                    const emails = (await emailsRes.json()) as unknown;
                    email = this.pickPrimaryEmail(emails);
                }
            } catch (error) {
                this.logger.warn(
                    `OAuth2 provider ${provider.slug} emails endpoint failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        const usernameRaw = pickClaim(userinfo, provider.usernameClaim);
        const username = typeof usernameRaw === "string" && usernameRaw.length > 0 ? usernameRaw : null;

        return {
            subject,
            email: email ? email.toLowerCase() : null,
            username,
        };
    }

    private pickPrimaryEmail(payload: unknown): string | null {
        if (!Array.isArray(payload)) return null;
        for (const entry of payload) {
            if (entry && typeof entry === "object" && "email" in entry) {
                const email = (entry as Record<string, unknown>).email;
                const primary = (entry as Record<string, unknown>).primary;
                const verified = (entry as Record<string, unknown>).verified;
                if (typeof email === "string" && primary === true && verified !== false) return email;
            }
        }
        for (const entry of payload) {
            if (entry && typeof entry === "object" && "email" in entry) {
                const email = (entry as Record<string, unknown>).email;
                if (typeof email === "string") return email;
            }
        }
        return null;
    }
}
