import {
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Logger,
    NotFoundException,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from "@nestjs/common";
import {ApiBearerAuth} from "@nestjs/swagger";
import {Throttle} from "@nestjs/throttler";
import {HttpAdapterHost} from "@nestjs/core";
import type {FastifyReply, FastifyRequest} from "fastify";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {User} from "../../../common/decorators/user.decorator";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {SsoService} from "./sso.service";
import {SsoConfigService} from "./sso-config.service";
import {SsoPublicProviderEntity} from "./models/entities/sso-public-provider.entity";
import {SsoIdentityEntity} from "./models/entities/sso-identity.entity";
import {SSO_MFA_COOKIE, SSO_MFA_COOKIE_MAX_AGE, SSO_TOKEN_COOKIE} from "./sso.constants";

@Controller("auth/sso")
export class SsoController {
    private readonly logger = new Logger(SsoController.name);

    constructor(
        private readonly ssoService: SsoService,
        private readonly config: SsoConfigService,
        private readonly adapterHost: HttpAdapterHost,
    ) {}

    @Get("providers")
    async listProviders(): Promise<SsoPublicProviderEntity[]> {
        return this.config.getEnabledProviders().map(
            (provider) =>
                new SsoPublicProviderEntity({
                    slug: provider.slug,
                    displayName: provider.displayName,
                    icon: provider.icon,
                }),
        );
    }

    @Get("identities")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async listIdentities(@User() user: UserEntity): Promise<SsoIdentityEntity[]> {
        return this.ssoService.listIdentitiesFor(user);
    }

    @Delete("identities/:id")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 10, ttl: 60_000}})
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiBearerAuth()
    async unlinkIdentity(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
    ): Promise<void> {
        await this.ssoService.unlinkIdentity(user, id);
    }

    @Get(":slug/start")
    @Throttle({default: {limit: 20, ttl: 60_000}})
    async startLogin(@Param("slug") slug: string, @Res() reply: FastifyReply): Promise<void> {
        const url = await this.ssoService.startLogin(slug);
        reply.redirect(url, HttpStatus.FOUND);
    }

    @Post(":slug/link/start")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 20, ttl: 60_000}})
    @ApiBearerAuth()
    async startLink(@Param("slug") slug: string, @User() user: UserEntity): Promise<{url: string}> {
        const url = await this.ssoService.startLink(slug, user);
        return {url};
    }

    @Get(":slug/callback")
    @Throttle({default: {limit: 20, ttl: 60_000}})
    async handleCallback(
        @Param("slug") slug: string,
        @Query("state") state: string,
        @Query("code") code: string,
        @Query("error") providerError: string,
        @Query("error_description") providerErrorDesc: string,
        @Req() req: FastifyRequest,
        @Res() reply: FastifyReply,
    ): Promise<void> {
        // Single callback route for both login and link flows: the state row
        // persisted at /start time carries the purpose and (for link) the
        // authenticated user id, so the IdP only ever needs one redirect_uri
        // whitelisted per provider.
        try {
            if (providerError) {
                this.logger.warn(`SSO provider ${slug} returned error: ${providerError} ${providerErrorDesc ?? ""}`);
                return this.redirectError(reply, "provider_error");
            }
            if (!state || !code) {
                return this.redirectError(reply, "invalid_request");
            }
            const callbackUrl = this.reconstructCallbackUrl(req, slug);
            const outcome = await this.ssoService.handleCallback(slug, state, code, callbackUrl);
            if (outcome.kind === "linked") {
                return this.redirectLinkResult(reply, "ok", outcome.identity.providerSlug);
            }
            if (outcome.kind === "authenticated") {
                this.setAuthCookie(reply, outcome.token);
                return reply.redirect(
                    this.config.frontendRedirectUrl("/auth/sso/complete", {status: "ok"}),
                    HttpStatus.FOUND,
                );
            }
            if (outcome.kind === "mfa_required") {
                this.setMfaCookie(reply, outcome.challengeToken, outcome.methods);
                return reply.redirect(
                    this.config.frontendRedirectUrl("/auth/sso/complete", {status: "mfa"}),
                    HttpStatus.FOUND,
                );
            }
            return this.redirectError(reply, "internal_error");
        } catch (error: any) {
            const errorCode = this.mapErrorCode(error);
            this.logger.warn(`SSO callback failed slug=${slug} code=${errorCode} err=${error?.message ?? error}`);
            return this.redirectError(reply, errorCode);
        }
    }

    private setAuthCookie(reply: FastifyReply, token: string): void {
        this.adapterHost.httpAdapter.setCookie(reply, SSO_TOKEN_COOKIE, token, {
            path: "/",
            httpOnly: false,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 30,
        });
    }

    private setMfaCookie(reply: FastifyReply, challengeToken: string, methods: string[]): void {
        const payload = JSON.stringify({challengeToken, methods});
        this.adapterHost.httpAdapter.setCookie(
            reply,
            SSO_MFA_COOKIE,
            Buffer.from(payload, "utf-8").toString("base64url"),
            {
                path: "/",
                httpOnly: false,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                maxAge: SSO_MFA_COOKIE_MAX_AGE,
            },
        );
    }

    private redirectError(reply: FastifyReply, code: string): void {
        reply.redirect(this.config.frontendRedirectUrl("/auth/sso/complete", {status: "error", code}), HttpStatus.FOUND);
    }

    private redirectLinkResult(reply: FastifyReply, status: "ok" | "error", detail: string): void {
        reply.redirect(
            this.config.frontendRedirectUrl("/settings/user/profile", {
                sso: status,
                detail,
            }),
            HttpStatus.FOUND,
        );
    }

    private reconstructCallbackUrl(req: FastifyRequest, slug: string): URL {
        // The openid-client library validates state/code from the URL itself.
        // We reconstruct it from the same base used to build the authorize URL
        // so PKCE / state checks match exactly.
        const base = this.config.callbackUrl(slug);
        const url = new URL(base);
        const query = req.query as Record<string, unknown>;
        for (const [key, value] of Object.entries(query ?? {})) {
            if (typeof value === "string") url.searchParams.set(key, value);
        }
        return url;
    }

    private mapErrorCode(error: unknown): string {
        if (error instanceof NotFoundException) return "unknown_provider";
        if (typeof error !== "object" || !error) return "internal_error";
        const status = (error as {status?: number}).status;
        if (status === 401) return "unauthorized";
        if (status === 409) return "email_conflict";
        if (status === 400) return "invalid_request";
        return "internal_error";
    }
}
