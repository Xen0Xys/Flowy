import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import crypto from "crypto";
import {PrismaService} from "../../helper/prisma.service";
import {InstanceConfigService} from "../../helper/instance-config.service";
import {AuthService} from "../auth.service";
import {UserService} from "../../users/user/user.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {SsoConfigService, SsoProviderConfig} from "./sso-config.service";
import {OidcProviderService, SsoNormalizedProfile} from "./providers/oidc-provider.service";
import {OAuth2ProviderService} from "./providers/oauth2-provider.service";
import {SsoIdentityEntity} from "./models/entities/sso-identity.entity";
import {
    SSO_MAX_USERNAME_ATTEMPTS,
    SSO_STATE_PURPOSE_LINK,
    SSO_STATE_PURPOSE_LOGIN,
    SSO_STATE_TTL_MS,
} from "./sso.constants";
import {MfaChallengeService} from "../mfa/mfa-challenge.service";
import type {MfaMethod} from "../mfa/mfa-factor.interface";

export type SsoStartMode = "login" | "link";

export type SsoOutcome =
    | {kind: "authenticated"; token: string; user: UserEntity}
    | {kind: "mfa_required"; challengeToken: string; methods: MfaMethod[]}
    | {kind: "linked"; identity: SsoIdentityEntity};

interface SsoStateRow {
    id: string;
    provider_slug: string;
    code_verifier: string;
    nonce: string | null;
    purpose: string;
    link_user_id: string | null;
    expires_at: Date;
}

@Injectable()
export class SsoService {
    private readonly logger = new Logger(SsoService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: SsoConfigService,
        private readonly instanceConfig: InstanceConfigService,
        private readonly oidcProvider: OidcProviderService,
        private readonly oauth2Provider: OAuth2ProviderService,
        private readonly authService: AuthService,
        private readonly mfaChallengeService: MfaChallengeService,
    ) {}

    async startLogin(slug: string): Promise<string> {
        const provider = this.requireProvider(slug);
        return this.buildAuthorizationUrl(provider, SSO_STATE_PURPOSE_LOGIN, null);
    }

    async startLink(slug: string, user: UserEntity): Promise<string> {
        const provider = this.requireProvider(slug);
        return this.buildAuthorizationUrl(provider, SSO_STATE_PURPOSE_LINK, user.id);
    }

    async handleCallback(slug: string, stateParam: string, code: string, callbackUrl: URL): Promise<SsoOutcome> {
        const {provider, state, profile} = await this.consumeCallback(slug, stateParam, code, callbackUrl);
        if (state.purpose === SSO_STATE_PURPOSE_LINK) {
            if (!state.link_user_id) {
                throw new BadRequestException("Invalid callback: link state missing user id");
            }
            const identity = await this.linkIdentity(state.link_user_id, provider, profile);
            return {kind: "linked", identity};
        }
        if (state.purpose === SSO_STATE_PURPOSE_LOGIN) {
            if (state.link_user_id) {
                throw new BadRequestException("Invalid callback: login state carries a link user id");
            }
            return this.resolveOrCreateUser(provider, profile);
        }
        throw new BadRequestException("SSO state has an unknown purpose");
    }

    async listIdentitiesFor(user: UserEntity): Promise<SsoIdentityEntity[]> {
        const rows = await this.prisma.userSsoIdentities.findMany({
            where: {user_id: user.id},
            orderBy: {linked_at: "asc"},
        });
        return rows.map((row) => this.toIdentityEntity(row));
    }

    async unlinkIdentity(user: UserEntity, identityId: string): Promise<void> {
        const identity = await this.prisma.userSsoIdentities.findUnique({where: {id: identityId}});
        if (!identity || identity.user_id !== user.id) {
            throw new NotFoundException("SSO identity not found");
        }
        const dbUser = await this.prisma.users.findUnique({where: {id: user.id}});
        if (!dbUser) throw new NotFoundException("User not found");
        const otherIdentities = await this.prisma.userSsoIdentities.count({
            where: {user_id: user.id, id: {not: identityId}},
        });
        const hasPassword = !!dbUser.password;
        if (!hasPassword && otherIdentities === 0) {
            throw new BadRequestException(
                "Cannot unlink the last SSO identity of an account without a password. Set a password first.",
            );
        }
        await this.prisma.userSsoIdentities.delete({where: {id: identityId}});
        this.logger.log(`actor=${user.id} action=sso.unlink provider=${identity.provider_slug}`);
    }

    private requireProvider(slug: string): SsoProviderConfig {
        const provider = this.config.getProvider(slug);
        if (!provider) throw new NotFoundException("Unknown SSO provider");
        return provider;
    }

    private async buildAuthorizationUrl(
        provider: SsoProviderConfig,
        purpose: string,
        linkUserId: string | null,
    ): Promise<string> {
        const stateId = crypto.randomBytes(24).toString("base64url");
        const callbackUrl = this.config.callbackUrl(provider.slug);

        let codeVerifier: string;
        let nonce: string | null = null;
        let authorizationUrl: string;

        if (provider.kind === "oidc") {
            const bundle = await this.oidcProvider.buildAuthorizationUrl(provider, callbackUrl, stateId);
            authorizationUrl = bundle.url;
            codeVerifier = bundle.codeVerifier;
            nonce = bundle.nonce;
        } else {
            const bundle = this.oauth2Provider.buildAuthorizationUrl(provider, callbackUrl, stateId);
            authorizationUrl = bundle.url;
            codeVerifier = bundle.codeVerifier;
        }

        await this.prisma.ssoStates.create({
            data: {
                id: stateId,
                provider_slug: provider.slug,
                code_verifier: codeVerifier,
                nonce: nonce,
                purpose,
                link_user_id: linkUserId,
                expires_at: new Date(Date.now() + SSO_STATE_TTL_MS),
            },
        });

        return authorizationUrl;
    }

    private async consumeCallback(
        slug: string,
        stateParam: string,
        code: string,
        callbackUrl: URL,
    ): Promise<{provider: SsoProviderConfig; state: SsoStateRow; profile: SsoNormalizedProfile}> {
        const provider = this.requireProvider(slug);
        const state = await this.loadState(stateParam);
        try {
            if (state.provider_slug !== provider.slug) {
                throw new BadRequestException("SSO state does not match provider");
            }
            const profile =
                provider.kind === "oidc"
                    ? await this.oidcProvider.exchangeCallback(
                          provider,
                          callbackUrl,
                          state.id,
                          state.code_verifier,
                          state.nonce ?? "",
                      )
                    : await this.oauth2Provider.exchangeCallback(
                          provider,
                          code,
                          this.config.callbackUrl(provider.slug),
                          state.code_verifier,
                      );
            return {provider, state, profile};
        } finally {
            // Single-use: always consume the state after exchange attempt.
            await this.prisma.ssoStates.delete({where: {id: state.id}}).catch(() => undefined);
        }
    }

    private async loadState(stateId: string): Promise<SsoStateRow> {
        if (!stateId) throw new BadRequestException("Missing SSO state");
        const row = await this.prisma.ssoStates.findUnique({where: {id: stateId}});
        if (!row) throw new UnauthorizedException("Invalid or expired SSO state");
        if (row.expires_at.getTime() < Date.now()) {
            await this.prisma.ssoStates.delete({where: {id: row.id}}).catch(() => undefined);
            throw new UnauthorizedException("Invalid or expired SSO state");
        }
        return row;
    }

    private async resolveOrCreateUser(provider: SsoProviderConfig, profile: SsoNormalizedProfile): Promise<SsoOutcome> {
        if (!profile.subject) throw new UnauthorizedException("SSO provider returned no subject");

        // Branch 1: existing identity → login
        const existing = await this.prisma.userSsoIdentities.findUnique({
            where: {
                provider_slug_provider_user_id: {
                    provider_slug: provider.slug,
                    provider_user_id: profile.subject,
                },
            },
        });
        if (existing) {
            const user = await this.prisma.users.findUnique({where: {id: existing.user_id}});
            if (!user) throw new UnauthorizedException("Linked user no longer exists");
            await this.prisma.userSsoIdentities.update({
                where: {id: existing.id},
                data: {last_login_at: new Date()},
            });
            this.logger.log(`actor=${user.id} action=sso.login provider=${provider.slug}`);
            return this.finalizeLogin(user);
        }

        if (!profile.email) {
            throw new UnauthorizedException("SSO provider returned no email; cannot resolve or create a Flowy account");
        }

        // Enforce provider allowed_email_domains before any account-lookup so
        // we never leak whether an email exists on the instance.
        this.assertDomainAllowed(provider, profile.email);

        // Branch 2: email matches an existing user without SSO identity → refuse
        // (Flowy does not verify emails; auto-linking would allow account takeover).
        const emailMatch = await this.prisma.users.findUnique({where: {email: profile.email}});
        if (emailMatch) {
            throw new ConflictException(
                "This email is already registered. Sign in with your password and link this provider from your profile.",
            );
        }

        // Branch 3: create new account (respecting the global REGISTRATION_ENABLED flag)
        if (!provider.allowSignup) {
            throw new UnauthorizedException("Sign-up is disabled for this provider");
        }
        if (!(await this.instanceConfig.registrationAllowed())) {
            throw new UnauthorizedException("Registration is disabled on this instance");
        }

        const username = await this.pickUniqueUsername(profile);
        const created = await this.prisma.$transaction(async (tx) => {
            const newUser = await tx.users.create({
                data: {
                    username,
                    email: profile.email!,
                    password: null,
                    jwt_id: crypto.randomBytes(16).toString("hex"),
                },
            });
            await tx.userSsoIdentities.create({
                data: {
                    user_id: newUser.id,
                    provider_slug: provider.slug,
                    provider_user_id: profile.subject,
                    email_at_link: profile.email,
                    last_login_at: new Date(),
                },
            });
            await tx.config.upsert({
                where: {key: "INSTANCE_OWNER" as any},
                update: {},
                create: {key: "INSTANCE_OWNER" as any, value: newUser.id},
            });
            return newUser;
        });
        this.logger.log(`actor=${created.id} action=sso.signup provider=${provider.slug}`);
        return this.finalizeLogin(created);
    }

    private async linkIdentity(
        userId: string,
        provider: SsoProviderConfig,
        profile: SsoNormalizedProfile,
    ): Promise<SsoIdentityEntity> {
        if (!profile.subject) throw new UnauthorizedException("SSO provider returned no subject");
        const existing = await this.prisma.userSsoIdentities.findUnique({
            where: {
                provider_slug_provider_user_id: {
                    provider_slug: provider.slug,
                    provider_user_id: profile.subject,
                },
            },
        });
        if (existing && existing.user_id !== userId) {
            throw new ConflictException("This SSO identity is already linked to another account");
        }
        const alreadyLinkedToUser = await this.prisma.userSsoIdentities.findUnique({
            where: {
                user_id_provider_slug: {
                    user_id: userId,
                    provider_slug: provider.slug,
                },
            },
        });
        if (alreadyLinkedToUser) {
            throw new ConflictException("You already have a linked identity for this provider");
        }
        const row = await this.prisma.userSsoIdentities.create({
            data: {
                user_id: userId,
                provider_slug: provider.slug,
                provider_user_id: profile.subject,
                email_at_link: profile.email,
                last_login_at: new Date(),
            },
        });
        this.logger.log(`actor=${userId} action=sso.link provider=${provider.slug}`);
        return this.toIdentityEntity(row);
    }

    private async finalizeLogin(user: {
        id: string;
        username: string;
        email: string;
        jwt_id: string;
        password: string | null;
        mfa_enabled: boolean;
        family_id: string | null;
        family_role: any;
    }): Promise<SsoOutcome> {
        const userEntity = UserService.toUserEntity(user as any);

        if (user.mfa_enabled) {
            const methods = await this.mfaChallengeService.getEnrolledMethods(user.id);
            const challengeToken = await this.mfaChallengeService.generateChallengeToken(user.id);
            return {kind: "mfa_required", challengeToken, methods};
        }

        const token = await this.authService.generateToken(userEntity);
        return {kind: "authenticated", token, user: userEntity};
    }

    private assertDomainAllowed(provider: SsoProviderConfig, email: string): void {
        if (provider.allowedEmailDomains.length === 0) return;
        const at = email.lastIndexOf("@");
        if (at < 0) throw new UnauthorizedException("SSO provider returned an invalid email");
        const domain = email.slice(at + 1).toLowerCase();
        if (!provider.allowedEmailDomains.includes(domain)) {
            throw new UnauthorizedException("Your email domain is not allowed for this provider");
        }
    }

    private async pickUniqueUsername(profile: SsoNormalizedProfile): Promise<string> {
        const candidates: string[] = [];
        if (profile.username) candidates.push(this.sanitizeUsername(profile.username));
        if (profile.email) candidates.push(this.sanitizeUsername(profile.email.split("@")[0] ?? ""));
        const base = candidates.find(Boolean) || `user-${crypto.randomBytes(3).toString("hex")}`;
        const trimmed = base.slice(0, 26);

        const attempts: string[] = [trimmed];
        for (let i = 2; i <= SSO_MAX_USERNAME_ATTEMPTS; i++) {
            attempts.push(`${trimmed}-${i}`.slice(0, 30));
        }

        // Single query fetches all colliding usernames in the candidate window,
        // avoiding a per-candidate roundtrip while still preferring the shortest
        // one that is free.
        const taken = new Set(
            (
                await this.prisma.users.findMany({
                    where: {username: {in: attempts}},
                    select: {username: true},
                })
            ).map((row) => row.username),
        );
        const free = attempts.find((candidate) => !taken.has(candidate));
        if (free) return free;

        return `${trimmed.slice(0, 22)}-${crypto.randomBytes(3).toString("hex")}`.slice(0, 30);
    }

    private sanitizeUsername(input: string): string {
        const stripped = input
            .trim()
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/-{2,}/g, "-")
            .replace(/^-+|-+$/g, "");
        if (stripped.length >= 3) return stripped;
        return `user-${crypto.randomBytes(3).toString("hex")}`;
    }

    private toIdentityEntity(row: {
        id: string;
        provider_slug: string;
        email_at_link: string | null;
        linked_at: Date;
        last_login_at: Date | null;
    }): SsoIdentityEntity {
        const provider = this.config.getProvider(row.provider_slug);
        return new SsoIdentityEntity({
            id: row.id,
            providerSlug: row.provider_slug,
            providerDisplayName: provider?.displayName ?? row.provider_slug,
            providerIcon: provider?.icon ?? "iconoir:key",
            emailAtLink: row.email_at_link,
            linkedAt: row.linked_at,
            lastLoginAt: row.last_login_at,
        });
    }
}
