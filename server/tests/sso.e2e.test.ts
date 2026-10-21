// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {afterAll, beforeAll, beforeEach, describe, expect, spyOn, test} from "bun:test";
import crypto from "crypto";
import {FastifyAdapter, NestFastifyApplication} from "@nestjs/platform-fastify";
import {ConfigKey, PrismaClient} from "../prisma/generated/client";
import {loadServer} from "../src/app";
import {AppModule} from "../src/app.module";
import {OAuth2ProviderService} from "../src/modules/auth/sso/providers/oauth2-provider.service";
import type {SsoNormalizedProfile} from "../src/modules/auth/sso/providers/oidc-provider.service";
import {SsoCleanupService} from "../src/modules/auth/sso/sso-cleanup.service";
import {PrismaPg} from "@prisma/adapter-pg";
import {Test} from "@nestjs/testing";
import {Server} from "node:http";
import request from "supertest";
import {buildRegisterPayload, createCsrfAgent, ensureInstanceConfig} from "./test-utils";

function pkcePair(): {verifier: string; challenge: string} {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    return {verifier, challenge};
}

function hashTicket(ticket: string): string {
    return crypto.createHash("sha256").update(ticket).digest("hex");
}

const SSO_ENV_KEYS = [
    "FRONTEND_URL",
    "BACKEND_URL",
    "SSO_1_KIND",
    "SSO_1_SLUG",
    "SSO_1_DISPLAY_NAME",
    "SSO_1_ICON",
    "SSO_1_CLIENT_ID",
    "SSO_1_CLIENT_SECRET",
    "SSO_1_AUTHORIZATION_URL",
    "SSO_1_TOKEN_URL",
    "SSO_1_USERINFO_URL",
    "SSO_1_SCOPES",
    "SSO_1_EMAIL_CLAIM",
    "SSO_1_USERNAME_CLAIM",
    "SSO_1_SUB_CLAIM",
    "SSO_1_ALLOWED_EMAIL_DOMAINS",
] as const;

const envBaseline = new Map<string, string | undefined>();

function seedSsoEnv(): void {
    for (const key of SSO_ENV_KEYS) {
        envBaseline.set(key, process.env[key]);
    }
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.BACKEND_URL = "http://localhost:4000";
    process.env.SSO_1_KIND = "oauth2";
    process.env.SSO_1_SLUG = "test-oauth2";
    process.env.SSO_1_DISPLAY_NAME = "Test Provider";
    process.env.SSO_1_ICON = "iconoir:github";
    process.env.SSO_1_CLIENT_ID = "test-client";
    process.env.SSO_1_CLIENT_SECRET = "test-secret";
    process.env.SSO_1_AUTHORIZATION_URL = "https://example.com/oauth/authorize";
    process.env.SSO_1_TOKEN_URL = "https://example.com/oauth/token";
    process.env.SSO_1_USERINFO_URL = "https://example.com/oauth/userinfo";
    process.env.SSO_1_SCOPES = "read:user,user:email";
    process.env.SSO_1_EMAIL_CLAIM = "email";
    process.env.SSO_1_USERNAME_CLAIM = "login";
    process.env.SSO_1_SUB_CLAIM = "id";
}

function restoreSsoEnv(): void {
    for (const [key, value] of envBaseline.entries()) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

async function makeOwner(prisma: PrismaClient, agent: ReturnType<typeof request.agent>) {
    const payload = buildRegisterPayload();
    const res = await agent.post("/auth/register").send(payload);
    expect(res.status).toBe(201);
    await prisma.config.upsert({
        where: {key: "INSTANCE_OWNER" as any},
        update: {value: res.body.user.id},
        create: {key: "INSTANCE_OWNER" as any, value: res.body.user.id},
    });
    return {token: res.body.token as string, userId: res.body.user.id as string};
}

describe("SsoController (e2e)", () => {
    let app: NestFastifyApplication;
    let server: Server;
    let prisma: PrismaClient;
    let agent: ReturnType<typeof request.agent>;
    let profile: SsoNormalizedProfile;

    beforeAll(async () => {
        seedSsoEnv();
        prisma = new PrismaClient({
            adapter: new PrismaPg({connectionString: process.env.DATABASE_URL}),
        });
        await prisma.$connect();
        await ensureInstanceConfig(prisma);

        const moduleRef = await Test.createTestingModule({imports: [AppModule]}).compile();
        app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({exposeHeadRoutes: true}));
        await loadServer(app);
        await app.init();
        const instance = app.getHttpAdapter().getInstance();
        await instance.ready();
        server = instance.server;

        // Stand-in for the IdP token + userinfo round trip.
        spyOn(app.get(OAuth2ProviderService), "exchangeCallback").mockImplementation(async () => profile);
    });

    beforeEach(async () => {
        profile = {
            subject: `remote-${crypto.randomBytes(4).toString("hex")}`,
            email: `sso-${crypto.randomBytes(4).toString("hex")}@example.com`,
            username: "sso-user",
        };
        await prisma.ssoLoginTickets.deleteMany();
        await prisma.mfaChallengeTokens.deleteMany();
        await prisma.ssoStates.deleteMany();
        await prisma.userSsoIdentities.deleteMany();
        await prisma.familyInvites.deleteMany();
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
        await prisma.family.deleteMany();
        await prisma.config.update({
            where: {key: ConfigKey.REGISTRATION_ENABLED},
            data: {value: "true"},
        });
        agent = await createCsrfAgent(server);
    });

    afterAll(async () => {
        if (app) await app.close();
        await prisma?.$disconnect();
        restoreSsoEnv();
    });

    test("lists configured SSO providers publicly with only public fields", async () => {
        const res = await agent.get("/auth/sso/providers");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toEqual({
            slug: "test-oauth2",
            displayName: "Test Provider",
            icon: "iconoir:github",
        });
    });

    test("returns 404 for a start on an unknown provider slug", async () => {
        const {challenge} = pkcePair();
        const res = await agent.get(`/auth/sso/does-not-exist/start?challenge=${challenge}`).redirects(0);
        expect(res.status).toBe(404);
    });

    test("start rejects a missing or malformed client challenge", async () => {
        const missing = await agent.get("/auth/sso/test-oauth2/start").redirects(0);
        expect(missing.status).toBe(400);
        const malformed = await agent.get("/auth/sso/test-oauth2/start?challenge=short").redirects(0);
        expect(malformed.status).toBe(400);
        expect(await prisma.ssoStates.count()).toBe(0);
    });

    async function runLoginFlow(challenge: string): Promise<request.Response> {
        const start = await agent.get(`/auth/sso/test-oauth2/start?challenge=${challenge}`).redirects(0);
        expect(start.status).toBe(302);
        const state = new URL(start.headers.location).searchParams.get("state");
        expect(state).toBeTruthy();
        return agent.get(`/auth/sso/test-oauth2/callback?state=${state}&code=provider-code`).redirects(0);
    }

    function ticketFrom(callback: request.Response): string {
        expect(callback.status).toBe(302);
        const location = new URL(callback.headers.location);
        expect(location.origin + location.pathname).toBe("http://localhost:3000/auth/sso/complete");
        expect(location.search).toBe("");
        const ticket = new URLSearchParams(location.hash.slice(1)).get("ticket");
        expect(typeof ticket).toBe("string");
        return ticket!;
    }

    test("callback hands over a fragment ticket that the starting browser exchanges for a session", async () => {
        const {verifier, challenge} = pkcePair();
        const callback = await runLoginFlow(challenge);
        expect(callback.headers["set-cookie"]).toBeUndefined();
        const ticket = ticketFrom(callback);

        const stored = await prisma.ssoLoginTickets.findMany();
        expect(stored).toHaveLength(1);
        expect(stored[0].id).toBe(hashTicket(ticket));
        expect(stored[0].client_challenge).toBe(challenge);

        const exchange = await agent.post("/auth/sso/exchange").send({ticket, verifier});
        expect(exchange.status).toBe(200);
        expect(typeof exchange.body.token).toBe("string");
        expect(exchange.body.user.email).toBe(profile.email);

        const me = await agent.get("/user/me").set("Authorization", `Bearer ${exchange.body.token}`);
        expect(me.status).toBe(200);
    });

    test("ticket is single-use", async () => {
        const {verifier, challenge} = pkcePair();
        const ticket = ticketFrom(await runLoginFlow(challenge));

        const first = await agent.post("/auth/sso/exchange").send({ticket, verifier});
        expect(first.status).toBe(200);
        const replay = await agent.post("/auth/sso/exchange").send({ticket, verifier});
        expect(replay.status).toBe(401);
    });

    test("ticket is rejected without the verifier of the starting browser and burned afterwards", async () => {
        const {verifier, challenge} = pkcePair();
        const ticket = ticketFrom(await runLoginFlow(challenge));

        const stolen = await agent.post("/auth/sso/exchange").send({ticket, verifier: pkcePair().verifier});
        expect(stolen.status).toBe(401);
        expect(await prisma.ssoLoginTickets.count()).toBe(0);

        const legit = await agent.post("/auth/sso/exchange").send({ticket, verifier});
        expect(legit.status).toBe(401);
    });

    test("expired ticket is rejected", async () => {
        const {verifier, challenge} = pkcePair();
        const ticket = ticketFrom(await runLoginFlow(challenge));
        await prisma.ssoLoginTickets.updateMany({data: {expires_at: new Date(Date.now() - 1000)}});

        const exchange = await agent.post("/auth/sso/exchange").send({ticket, verifier});
        expect(exchange.status).toBe(401);
    });

    test("exchange validates the payload shape", async () => {
        const res = await agent.post("/auth/sso/exchange").send({ticket: "nope", verifier: "nope"});
        expect(res.status).toBe(400);
    });

    test("exchange returns an MFA challenge when the account requires a second factor", async () => {
        const {verifier, challenge} = pkcePair();
        ticketFrom(await runLoginFlow(challenge));
        await prisma.ssoLoginTickets.deleteMany();
        await prisma.users.update({where: {email: profile.email!}, data: {mfa_enabled: true}});

        const ticket = ticketFrom(await runLoginFlow(challenge));
        const exchange = await agent.post("/auth/sso/exchange").send({ticket, verifier});
        expect(exchange.status).toBe(200);
        expect(exchange.body.mfaRequired).toBe(true);
        expect(typeof exchange.body.challengeToken).toBe("string");
        expect(exchange.body.token).toBeUndefined();
    });

    test("callback refuses a login state created without a client challenge", async () => {
        await prisma.ssoStates.create({
            data: {
                id: "legacy-state",
                provider_slug: "test-oauth2",
                code_verifier: "v".repeat(43),
                purpose: "login",
                expires_at: new Date(Date.now() + 60_000),
            },
        });
        const callback = await agent
            .get("/auth/sso/test-oauth2/callback?state=legacy-state&code=provider-code")
            .redirects(0);
        expect(callback.status).toBe(302);
        const location = new URL(callback.headers.location);
        expect(location.searchParams.get("status")).toBe("error");
        expect(location.searchParams.get("code")).toBe("invalid_request");
        expect(await prisma.ssoLoginTickets.count()).toBe(0);
    });

    test("link flow still redirects to the profile page without a ticket", async () => {
        const reg = await agent.post("/auth/register").send(buildRegisterPayload());
        expect(reg.status).toBe(201);
        const start = await agent
            .post("/auth/sso/test-oauth2/link/start")
            .set("Authorization", `Bearer ${reg.body.token}`);
        expect(start.status).toBe(201);
        const state = new URL(start.body.url).searchParams.get("state");

        const callback = await agent
            .get(`/auth/sso/test-oauth2/callback?state=${state}&code=provider-code`)
            .redirects(0);
        expect(callback.status).toBe(302);
        const location = new URL(callback.headers.location);
        expect(location.pathname).toBe("/settings/user/profile");
        expect(location.searchParams.get("sso")).toBe("ok");
        expect(location.hash).toBe("");
        expect(await prisma.ssoLoginTickets.count()).toBe(0);
    });

    test("cleanup purges expired tickets and keeps valid ones", async () => {
        const reg = await agent.post("/auth/register").send(buildRegisterPayload());
        const {challenge} = pkcePair();
        await prisma.ssoLoginTickets.createMany({
            data: [
                {
                    id: hashTicket("expired"),
                    user_id: reg.body.user.id,
                    client_challenge: challenge,
                    expires_at: new Date(Date.now() - 1000),
                },
                {
                    id: hashTicket("valid"),
                    user_id: reg.body.user.id,
                    client_challenge: challenge,
                    expires_at: new Date(Date.now() + 60_000),
                },
            ],
        });

        await app.get(SsoCleanupService).cleanupExpired();

        const remaining = await prisma.ssoLoginTickets.findMany();
        expect(remaining.map((row) => row.id)).toEqual([hashTicket("valid")]);
    });

    test("POST /auth/sso/:slug/link/start requires authentication and rejects unknown slugs", async () => {
        const anon = await agent.post("/auth/sso/test-oauth2/link/start");
        expect(anon.status).toBe(401);

        const payload = buildRegisterPayload();
        const reg = await agent.post("/auth/register").send(payload);
        expect(reg.status).toBe(201);

        const unknown = await agent
            .post("/auth/sso/does-not-exist/link/start")
            .set("Authorization", `Bearer ${reg.body.token}`);
        expect(unknown.status).toBe(404);
    });

    test("lists own SSO identities and hides other users' identities", async () => {
        const aPayload = buildRegisterPayload();
        const bPayload = buildRegisterPayload();
        const regA = await agent.post("/auth/register").send(aPayload);
        expect(regA.status).toBe(201);
        const regB = await agent.post("/auth/register").send(bPayload);
        expect(regB.status).toBe(201);

        await prisma.userSsoIdentities.create({
            data: {
                user_id: regA.body.user.id,
                provider_slug: "test-oauth2",
                provider_user_id: "remote-user-a",
                email_at_link: "a@example.com",
            },
        });
        await prisma.userSsoIdentities.create({
            data: {
                user_id: regB.body.user.id,
                provider_slug: "test-oauth2",
                provider_user_id: "remote-user-b",
                email_at_link: "b@example.com",
            },
        });

        const listA = await agent.get("/auth/sso/identities").set("Authorization", `Bearer ${regA.body.token}`);
        expect(listA.status).toBe(200);
        expect(listA.body).toHaveLength(1);
        expect(listA.body[0]).toMatchObject({
            providerSlug: "test-oauth2",
            emailAtLink: "a@example.com",
            providerDisplayName: "Test Provider",
            providerIcon: "iconoir:github",
        });
    });

    test("unlink succeeds when a password is set, and refuses the last identity of a passwordless account", async () => {
        const payload = buildRegisterPayload();
        const reg = await agent.post("/auth/register").send(payload);
        expect(reg.status).toBe(201);
        const token = reg.body.token;
        const userId = reg.body.user.id;

        const identity = await prisma.userSsoIdentities.create({
            data: {
                user_id: userId,
                provider_slug: "test-oauth2",
                provider_user_id: "remote-1",
                email_at_link: "user@example.com",
            },
        });

        const withPassword = await agent
            .delete(`/auth/sso/identities/${identity.id}`)
            .set("Authorization", `Bearer ${token}`);
        expect(withPassword.status).toBe(204);
        expect(await prisma.userSsoIdentities.count({where: {user_id: userId}})).toBe(0);

        const identity2 = await prisma.userSsoIdentities.create({
            data: {
                user_id: userId,
                provider_slug: "test-oauth2",
                provider_user_id: "remote-2",
            },
        });
        await prisma.users.update({where: {id: userId}, data: {password: null}});

        const attempt = await agent
            .delete(`/auth/sso/identities/${identity2.id}`)
            .set("Authorization", `Bearer ${token}`);
        expect(attempt.status).toBe(400);
        expect(attempt.body.message).toContain("Cannot unlink the last SSO identity");
    });

    test("returns 404 when unlinking an identity owned by another user", async () => {
        const aPayload = buildRegisterPayload();
        const bPayload = buildRegisterPayload();
        const regA = await agent.post("/auth/register").send(aPayload);
        expect(regA.status).toBe(201);
        const regB = await agent.post("/auth/register").send(bPayload);
        expect(regB.status).toBe(201);

        const otherIdentity = await prisma.userSsoIdentities.create({
            data: {
                user_id: regB.body.user.id,
                provider_slug: "test-oauth2",
                provider_user_id: "remote-user-b",
            },
        });

        const res = await agent
            .delete(`/auth/sso/identities/${otherIdentity.id}`)
            .set("Authorization", `Bearer ${regA.body.token}`);
        expect(res.status).toBe(404);
    });

    test("login refuses an SSO-only account with a generic 'Invalid email or password'", async () => {
        const payload = buildRegisterPayload();
        const reg = await agent.post("/auth/register").send(payload);
        expect(reg.status).toBe(201);

        await prisma.users.update({where: {email: payload.email}, data: {password: null}});

        const login = await agent.post("/auth/login").send({email: payload.email, password: payload.password});
        expect(login.status).toBe(401);
        expect(login.body.message).toBe("Invalid email or password");
    });

    test("owner can list admin SSO providers with detailed fields", async () => {
        const owner = await makeOwner(prisma, agent);

        const res = await agent.get("/admin/sso/providers").set("Authorization", `Bearer ${owner.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({
            slug: "test-oauth2",
            kind: "oauth2",
            displayName: "Test Provider",
            scopes: ["read:user", "user:email"],
            allowSignup: true,
            callbackUrl: "http://localhost:4000/auth/sso/test-oauth2/callback",
        });
    });

    test("non-owner cannot list admin SSO providers", async () => {
        await makeOwner(prisma, agent);
        const otherPayload = buildRegisterPayload();
        const regOther = await agent.post("/auth/register").send(otherPayload);
        expect(regOther.status).toBe(201);

        const res = await agent.get("/admin/sso/providers").set("Authorization", `Bearer ${regOther.body.token}`);
        expect(res.status).toBe(401);
        expect(res.body.message).toBe("Only instance owner can access");
    });
});
