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
import crypto from "node:crypto";
import request from "supertest";
import * as OTPAuth from "otpauth";
import {createCsrfAgent, ensureInstanceConfig, registerUser} from "./test-utils";

describe("Passkey MFA (e2e)", () => {
    let app: NestFastifyApplication;
    let server: Server;
    let prisma: PrismaClient;
    let agent: ReturnType<typeof request.agent>;

    beforeAll(async () => {
        prisma = new PrismaClient({
            adapter: new PrismaPg({
                connectionString: process.env.DATABASE_URL,
            }),
        });
        await prisma.$connect();
        await ensureInstanceConfig(prisma);

        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({exposeHeadRoutes: true}));
        await loadServer(app);
        await app.init();
        const instance = app.getHttpAdapter().getInstance();
        await instance.ready();
        server = instance.server;
    });

    beforeEach(async () => {
        await prisma.webAuthnChallenges.deleteMany();
        await prisma.userPasskeys.deleteMany();
        await prisma.mfaBackupCodes.deleteMany();
        await prisma.userTotpSecret.deleteMany();
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
    });

    async function seedPasskey(
        userId: string,
        overrides: {label?: string; credentialId?: string} = {},
    ): Promise<{id: string; credentialId: string}> {
        const credentialId = overrides.credentialId ?? crypto.randomBytes(32).toString("base64url");
        const created = await prisma.userPasskeys.create({
            data: {
                user_id: userId,
                credential_id: credentialId,
                public_key: crypto.randomBytes(65),
                counter: BigInt(0),
                transports: ["internal"],
                device_type: "multiDevice",
                backed_up: true,
                label: overrides.label ?? "Test key",
            },
        });
        await prisma.users.update({where: {id: userId}, data: {mfa_enabled: true}});
        return {id: created.id, credentialId};
    }

    async function setupTotp(token: string, password: string): Promise<{secret: string; token: string}> {
        const setup = await agent
            .post("/auth/mfa/totp/setup")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: password});
        const secret = setup.body.secret as string;
        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30});
        const confirm = await agent
            .post("/auth/mfa/totp/setup/confirm")
            .set("Authorization", `Bearer ${token}`)
            .send({code: totp.generate()});
        return {secret, token: confirm.body.token as string};
    }

    test("register/options rejects with wrong password", async () => {
        const user = await registerUser(server);
        const response = await agent
            .post("/auth/mfa/passkey/register/options")
            .set("Authorization", `Bearer ${user.token}`)
            .send({currentPassword: "wrong"});
        expect(response.status).toBe(403);
    });

    test("register/options returns a challenge for the enrolled user", async () => {
        const user = await registerUser(server);
        const response = await agent
            .post("/auth/mfa/passkey/register/options")
            .set("Authorization", `Bearer ${user.token}`)
            .send({currentPassword: user.password});
        expect(response.status).toBe(201);
        expect(typeof response.body.challenge).toBe("string");
        expect(response.body.rp.id).toBeTruthy();
        expect(response.body.user.name).toBe(user.user.email);

        const stored = await prisma.webAuthnChallenges.findFirst({where: {user_id: user.user.id}});
        expect(stored?.purpose).toBe("registration");
    });

    test("GET /auth/mfa/passkey returns seeded passkeys", async () => {
        const user = await registerUser(server);
        await seedPasskey(user.user.id, {label: "iPhone"});

        const response = await agent.get("/auth/mfa/passkey").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].label).toBe("iPhone");
        expect(response.body[0]).not.toHaveProperty("publicKey");
    });

    test("PATCH renames a passkey", async () => {
        const user = await registerUser(server);
        const {id} = await seedPasskey(user.user.id, {label: "Old"});

        const response = await agent
            .patch(`/auth/mfa/passkey/${id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({label: "MacBook Pro"});
        expect(response.status).toBe(200);
        expect(response.body.label).toBe("MacBook Pro");

        const row = await prisma.userPasskeys.findUnique({where: {id}});
        expect(row?.label).toBe("MacBook Pro");
    });

    test("DELETE rejects with wrong password", async () => {
        const user = await registerUser(server);
        const {id} = await seedPasskey(user.user.id);

        const response = await agent
            .delete(`/auth/mfa/passkey/${id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({currentPassword: "wrong"});
        expect(response.status).toBe(403);
    });

    test("DELETE removes passkey and auto-disables MFA when no other factor remains", async () => {
        const user = await registerUser(server);
        const {id} = await seedPasskey(user.user.id);

        const response = await agent
            .delete(`/auth/mfa/passkey/${id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({currentPassword: user.password});
        expect(response.status).toBe(204);

        const dbUser = await prisma.users.findUnique({where: {id: user.user.id}});
        expect(dbUser?.mfa_enabled).toBe(false);
        const remaining = await prisma.userPasskeys.count({where: {user_id: user.user.id}});
        expect(remaining).toBe(0);
    });

    test("DELETE keeps MFA enabled when TOTP is still configured", async () => {
        const user = await registerUser(server);
        const {token: rotatedToken} = await setupTotp(user.token, user.password);
        const {id} = await seedPasskey(user.user.id);

        const response = await agent
            .delete(`/auth/mfa/passkey/${id}`)
            .set("Authorization", `Bearer ${rotatedToken}`)
            .send({currentPassword: user.password});
        expect(response.status).toBe(204);

        const dbUser = await prisma.users.findUnique({where: {id: user.user.id}});
        expect(dbUser?.mfa_enabled).toBe(true);
    });

    test("login exposes passkey in methods when enrolled", async () => {
        const user = await registerUser(server);
        await seedPasskey(user.user.id);

        const login = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        expect(login.body.mfaRequired).toBe(true);
        expect(login.body.methods).toContain("passkey");
    });

    test("challenge/options returns allowCredentials for the challenge subject", async () => {
        const user = await registerUser(server);
        const {credentialId} = await seedPasskey(user.user.id);
        const login = await agent.post("/auth/login").send({email: user.user.email, password: user.password});

        const response = await agent
            .post("/auth/mfa/passkey/challenge/options")
            .send({challengeToken: login.body.challengeToken});
        expect(response.status).toBe(201);
        expect(typeof response.body.challenge).toBe("string");
        expect(response.body.allowCredentials).toEqual(
            expect.arrayContaining([expect.objectContaining({id: credentialId})]),
        );
    });

    test("challenge/verify rejects invalid challenge token", async () => {
        const response = await agent
            .post("/auth/mfa/passkey/challenge/verify")
            .send({challengeToken: "not-a-jwt", response: {id: "x", rawId: "x", response: {}, type: "public-key"}});
        expect(response.status).toBe(401);
    });

    test("admin MFA reset also purges passkeys", async () => {
        const owner = await registerUser(server);
        const other = await registerUser(server);
        await seedPasskey(other.user.id);

        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const reset = await agent
            .delete(`/admin/users/${other.user.id}/mfa`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({currentPassword: owner.password});
        expect(reset.status).toBe(204);

        const remaining = await prisma.userPasskeys.count({where: {user_id: other.user.id}});
        expect(remaining).toBe(0);
    });
});
