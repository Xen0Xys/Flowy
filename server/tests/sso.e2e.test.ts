// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {afterAll, beforeAll, beforeEach, describe, expect, test} from "bun:test";
import {FastifyAdapter, NestFastifyApplication} from "@nestjs/platform-fastify";
import {ConfigKey, PrismaClient} from "../prisma/generated/client";
import {loadServer} from "../src/app";
import {AppModule} from "../src/app.module";
import {PrismaPg} from "@prisma/adapter-pg";
import {Test} from "@nestjs/testing";
import {Server} from "node:http";
import request from "supertest";
import {buildRegisterPayload, createCsrfAgent, ensureInstanceConfig} from "./test-utils";

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
    });

    beforeEach(async () => {
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
        const res = await agent.get("/auth/sso/does-not-exist/start").redirects(0);
        expect(res.status).toBe(404);
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
