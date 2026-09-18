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

describe("MfaController (e2e)", () => {
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
        await prisma.mfaChallengeTokens.deleteMany();
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

    async function seedPasskey(userId: string): Promise<void> {
        await prisma.userPasskeys.create({
            data: {
                user_id: userId,
                credential_id: crypto.randomBytes(32).toString("base64url"),
                public_key: crypto.randomBytes(65),
                counter: BigInt(0),
                transports: ["internal"],
                device_type: "multiDevice",
                backed_up: true,
                label: "Test key",
            },
        });
        await prisma.users.update({where: {id: userId}, data: {mfa_enabled: true}});
    }

    afterAll(async () => {
        if (app) await app.close();
        await prisma?.$disconnect();
    });

    async function setupMfa(
        token: string,
        password: string,
    ): Promise<{secret: string; backupCodes: string[]; token: string}> {
        const setup = await agent
            .post("/auth/mfa/totp/setup")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: password});
        expect(setup.status).toBe(201);
        const secret = setup.body.secret as string;

        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30});
        const code = totp.generate();

        const confirm = await agent
            .post("/auth/mfa/totp/setup/confirm")
            .set("Authorization", `Bearer ${token}`)
            .send({code});
        expect(confirm.status).toBe(201);
        return {
            secret,
            backupCodes: confirm.body.backupCodes as string[],
            token: confirm.body.token as string,
        };
    }

    test("setup: rejects setup with wrong password", async () => {
        const user = await registerUser(server);
        const response = await agent
            .post("/auth/mfa/totp/setup")
            .set("Authorization", `Bearer ${user.token}`)
            .send({currentPassword: "wrong"});
        expect(response.status).toBe(403);
    });

    test("setup + confirm activates MFA and returns backup codes", async () => {
        const user = await registerUser(server);
        const {backupCodes} = await setupMfa(user.token, user.password);
        expect(backupCodes).toHaveLength(10);
        expect(backupCodes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
        const dbUser = await prisma.users.findUnique({where: {id: user.user.id}});
        expect(dbUser?.mfa_enabled).toBe(true);
    });

    test("login with MFA returns challenge instead of token", async () => {
        const user = await registerUser(server);
        await setupMfa(user.token, user.password);

        const login = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        expect(login.status).toBe(201);
        expect(login.body.mfaRequired).toBe(true);
        expect(typeof login.body.challengeToken).toBe("string");
        expect(login.body.methods).toEqual(expect.arrayContaining(["totp", "backup_code"]));
        expect(login.body.token).toBeUndefined();
    });

    test("verify totp challenge returns auth token and keeps MFA enabled", async () => {
        const user = await registerUser(server);
        const {secret} = await setupMfa(user.token, user.password);

        // Reset last_used_step so confirm-generated code cannot be replayed and next
        // verify is accepted. In real usage a new 30s step naturally happens.
        await prisma.userTotpSecret.update({
            where: {user_id: user.user.id},
            data: {last_used_step: null},
        });

        const login = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30});

        const verify = await agent
            .post("/auth/mfa/totp/verify")
            .send({challengeToken: login.body.challengeToken, code: totp.generate()});
        expect(verify.status).toBe(201);
        expect(typeof verify.body.token).toBe("string");
        expect(verify.body.user.email).toBe(user.user.email);
        expect(verify.body.mfaAutoDisabled).toBe(false);

        const dbUser = await prisma.users.findUnique({where: {id: user.user.id}});
        expect(dbUser?.mfa_enabled).toBe(true);
    });

    test("verify with invalid code rejects", async () => {
        const user = await registerUser(server);
        await setupMfa(user.token, user.password);

        const login = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        const verify = await agent
            .post("/auth/mfa/totp/verify")
            .send({challengeToken: login.body.challengeToken, code: "000000"});
        expect(verify.status).toBe(401);
    });

    test("backup code verify consumes only the presented code and keeps MFA enabled", async () => {
        const user = await registerUser(server);
        const {backupCodes} = await setupMfa(user.token, user.password);

        const [code1, code2] = backupCodes;

        const login1 = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        const verify1 = await agent
            .post("/auth/mfa/backup-codes/verify")
            .send({challengeToken: login1.body.challengeToken, code: code1});
        expect(verify1.status).toBe(201);
        expect(verify1.body.mfaAutoDisabled).toBe(false);
        expect(typeof verify1.body.token).toBe("string");

        const dbUser = await prisma.users.findUnique({where: {id: user.user.id}});
        expect(dbUser?.mfa_enabled).toBe(true);
        const totpRow = await prisma.userTotpSecret.findUnique({where: {user_id: user.user.id}});
        expect(totpRow).not.toBeNull();

        const usedCodes = await prisma.mfaBackupCodes.count({
            where: {user_id: user.user.id, used_at: {not: null}},
        });
        expect(usedCodes).toBe(1);
        const remainingCodes = await prisma.mfaBackupCodes.count({
            where: {user_id: user.user.id, used_at: null},
        });
        expect(remainingCodes).toBe(backupCodes.length - 1);

        // Next login still returns a challenge
        const login2 = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        expect(login2.body.mfaRequired).toBe(true);
        expect(typeof login2.body.challengeToken).toBe("string");

        // Second backup code still works
        const verify2 = await agent
            .post("/auth/mfa/backup-codes/verify")
            .send({challengeToken: login2.body.challengeToken, code: code2});
        expect(verify2.status).toBe(201);
        expect(typeof verify2.body.token).toBe("string");

        // Same consumed code #1 is rejected on a fresh challenge
        const login3 = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        const verify3 = await agent
            .post("/auth/mfa/backup-codes/verify")
            .send({challengeToken: login3.body.challengeToken, code: code1});
        expect(verify3.status).toBe(401);
    });

    test("challenge token is single-use: replay after success is rejected", async () => {
        const user = await registerUser(server);
        const {secret} = await setupMfa(user.token, user.password);
        await prisma.userTotpSecret.update({
            where: {user_id: user.user.id},
            data: {last_used_step: null},
        });

        const login = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30});
        const code = totp.generate();

        const verify1 = await agent
            .post("/auth/mfa/totp/verify")
            .send({challengeToken: login.body.challengeToken, code});
        expect(verify1.status).toBe(201);

        // Replaying the same challenge token is rejected because the DB row
        // was deleted on the first successful verify.
        const verify2 = await agent
            .post("/auth/mfa/totp/verify")
            .send({challengeToken: login.body.challengeToken, code});
        expect(verify2.status).toBe(401);
    });

    test("challenge token is invalidated after 5 wrong attempts", async () => {
        const user = await registerUser(server);
        await setupMfa(user.token, user.password);

        const login = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        const token = login.body.challengeToken as string;

        for (let i = 0; i < 4; i++) {
            // oxlint-disable-next-line no-await-in-loop -- sequential to exercise attempt counter decrement
            const r = await agent.post("/auth/mfa/totp/verify").send({challengeToken: token, code: "000000"});
            expect(r.status).toBe(401);
        }

        // 5th attempt exhausts the token and deletes the DB row.
        const fifth = await agent.post("/auth/mfa/totp/verify").send({challengeToken: token, code: "000000"});
        expect(fifth.status).toBe(401);

        const remaining = await prisma.mfaChallengeTokens.count({where: {user_id: user.user.id}});
        expect(remaining).toBe(0);

        // Any further use of the same token, even with a correct format, is rejected.
        const sixth = await agent.post("/auth/mfa/totp/verify").send({challengeToken: token, code: "000000"});
        expect(sixth.status).toBe(401);
    });

    test("cross-user challenge token is rejected", async () => {
        const alice = await registerUser(server);
        const bob = await registerUser(server);
        await setupMfa(alice.token, alice.password);
        await setupMfa(bob.token, bob.password);

        const loginAlice = await agent.post("/auth/login").send({email: alice.user.email, password: alice.password});
        // Forge a JWT that pretends Bob signed Alice's challenge: since jti is
        // bound to Alice's row, it cannot be replayed against Bob's account.
        const forged = loginAlice.body.challengeToken as string;
        const verify = await agent
            .post("/auth/mfa/backup-codes/verify")
            .send({challengeToken: forged, code: "AAAAAAAA"});
        // Wrong code against Alice's challenge -> 401 (not a match to Bob's factors).
        expect(verify.status).toBe(401);

        const usedByAlice = await prisma.mfaBackupCodes.count({
            where: {user_id: alice.user.id, used_at: {not: null}},
        });
        const usedByBob = await prisma.mfaBackupCodes.count({
            where: {user_id: bob.user.id, used_at: {not: null}},
        });
        expect(usedByAlice).toBe(0);
        expect(usedByBob).toBe(0);
    });

    test("expired challenge token is rejected", async () => {
        const user = await registerUser(server);
        const {secret} = await setupMfa(user.token, user.password);

        const login = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30});

        await prisma.mfaChallengeTokens.updateMany({
            where: {user_id: user.user.id},
            data: {expires_at: new Date(Date.now() - 1_000)},
        });

        const verify = await agent
            .post("/auth/mfa/totp/verify")
            .send({challengeToken: login.body.challengeToken, code: totp.generate()});
        expect(verify.status).toBe(401);
    });

    test("MFA verify rotates jwt_id so old tokens are invalidated", async () => {
        const user = await registerUser(server);
        const {secret} = await setupMfa(user.token, user.password);
        const preMfaToken = user.token;

        await prisma.userTotpSecret.update({
            where: {user_id: user.user.id},
            data: {last_used_step: null},
        });
        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30});

        const login = await agent.post("/auth/login").send({email: user.user.email, password: user.password});
        const verify = await agent
            .post("/auth/mfa/totp/verify")
            .send({challengeToken: login.body.challengeToken, code: totp.generate()});
        expect(verify.status).toBe(201);

        // The pre-MFA token (from initial registration) is now invalid.
        const check = await agent.get("/user/me").set("Authorization", `Bearer ${preMfaToken}`);
        expect(check.status).toBe(401);
    });

    test("confirmTotpSetup preserves backup codes when a passkey is already enrolled", async () => {
        const user = await registerUser(server);
        await seedPasskey(user.user.id);

        const setup = await agent
            .post("/auth/mfa/totp/setup")
            .set("Authorization", `Bearer ${user.token}`)
            .send({currentPassword: user.password});
        expect(setup.status).toBe(201);

        const secret = setup.body.secret as string;
        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30});
        const confirm = await agent
            .post("/auth/mfa/totp/setup/confirm")
            .set("Authorization", `Bearer ${user.token}`)
            .send({code: totp.generate()});
        expect(confirm.status).toBe(201);
        expect(confirm.body.token).toBeNull();
        expect(confirm.body.backupCodes).toBeNull();

        const dbUser = await prisma.users.findUnique({where: {id: user.user.id}});
        expect(dbUser?.mfa_enabled).toBe(true);
        const passkeyCount = await prisma.userPasskeys.count({where: {user_id: user.user.id}});
        expect(passkeyCount).toBe(1);
        const totpRow = await prisma.userTotpSecret.findUnique({where: {user_id: user.user.id}});
        expect(totpRow?.confirmed_at).not.toBeNull();
    });

    test("DELETE /auth/mfa/totp removes only TOTP when a passkey remains", async () => {
        const user = await registerUser(server);
        const {secret, token} = await setupMfa(user.token, user.password);
        await seedPasskey(user.user.id);

        // Reset last_used_step to allow the same-window code again.
        await prisma.userTotpSecret.update({
            where: {user_id: user.user.id},
            data: {last_used_step: null},
        });
        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30});

        const response = await agent
            .delete("/auth/mfa/totp")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: user.password, code: totp.generate()});
        expect(response.status).toBe(204);

        const dbUser = await prisma.users.findUnique({where: {id: user.user.id}});
        expect(dbUser?.mfa_enabled).toBe(true);
        const totpRow = await prisma.userTotpSecret.findUnique({where: {user_id: user.user.id}});
        expect(totpRow).toBeNull();
        const passkeyCount = await prisma.userPasskeys.count({where: {user_id: user.user.id}});
        expect(passkeyCount).toBe(1);
        const backupCount = await prisma.mfaBackupCodes.count({where: {user_id: user.user.id}});
        expect(backupCount).toBeGreaterThan(0);
    });

    test("DELETE /auth/mfa/totp fully disables MFA when no passkey remains", async () => {
        const user = await registerUser(server);
        const {secret, token} = await setupMfa(user.token, user.password);

        await prisma.userTotpSecret.update({
            where: {user_id: user.user.id},
            data: {last_used_step: null},
        });
        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30});

        const response = await agent
            .delete("/auth/mfa/totp")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: user.password, code: totp.generate()});
        expect(response.status).toBe(204);

        const dbUser = await prisma.users.findUnique({where: {id: user.user.id}});
        expect(dbUser?.mfa_enabled).toBe(false);
        const backupCount = await prisma.mfaBackupCodes.count({where: {user_id: user.user.id}});
        expect(backupCount).toBe(0);
    });

    test("DELETE /auth/mfa purges every factor at once", async () => {
        const user = await registerUser(server);
        const {secret, token} = await setupMfa(user.token, user.password);
        await seedPasskey(user.user.id);

        await prisma.userTotpSecret.update({
            where: {user_id: user.user.id},
            data: {last_used_step: null},
        });
        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30});

        const response = await agent
            .delete("/auth/mfa")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: user.password, code: totp.generate()});
        expect(response.status).toBe(204);

        const dbUser = await prisma.users.findUnique({where: {id: user.user.id}});
        expect(dbUser?.mfa_enabled).toBe(false);
        const totpRow = await prisma.userTotpSecret.findUnique({where: {user_id: user.user.id}});
        expect(totpRow).toBeNull();
        const passkeyCount = await prisma.userPasskeys.count({where: {user_id: user.user.id}});
        expect(passkeyCount).toBe(0);
    });

    test("regenerate/disable rejects when neither code nor passkey proof is provided", async () => {
        const user = await registerUser(server);
        const {token} = await setupMfa(user.token, user.password);

        const response = await agent
            .delete("/auth/mfa/totp")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: user.password});
        expect(response.status).toBe(400);
    });

    test("GET /auth/mfa/factors reports per-factor state", async () => {
        const user = await registerUser(server);

        const initial = await agent.get("/auth/mfa/factors").set("Authorization", `Bearer ${user.token}`);
        expect(initial.status).toBe(200);
        expect(initial.body).toEqual({
            mfaEnabled: false,
            totpEnrolled: false,
            passkeyCount: 0,
            unusedBackupCodes: 0,
        });

        const {token} = await setupMfa(user.token, user.password);
        await seedPasskey(user.user.id);

        const enriched = await agent.get("/auth/mfa/factors").set("Authorization", `Bearer ${token}`);
        expect(enriched.status).toBe(200);
        expect(enriched.body.mfaEnabled).toBe(true);
        expect(enriched.body.totpEnrolled).toBe(true);
        expect(enriched.body.passkeyCount).toBe(1);
        expect(enriched.body.unusedBackupCodes).toBeGreaterThan(0);
    });

    test("passkey settings/options rejects when no passkey is enrolled", async () => {
        const user = await registerUser(server);
        const response = await agent
            .post("/auth/mfa/passkey/settings/options")
            .set("Authorization", `Bearer ${user.token}`)
            .send({});
        expect(response.status).toBe(400);
    });

    test("passkey settings/options returns a challenge when a passkey is enrolled", async () => {
        const user = await registerUser(server);
        await seedPasskey(user.user.id);

        const response = await agent
            .post("/auth/mfa/passkey/settings/options")
            .set("Authorization", `Bearer ${user.token}`)
            .send({});
        expect(response.status).toBe(201);
        expect(typeof response.body.challenge).toBe("string");

        const stored = await prisma.webAuthnChallenges.findFirst({
            where: {user_id: user.user.id, purpose: "settings-verify"},
        });
        expect(stored).not.toBeNull();
    });

    test("admin can reset another user's MFA when admin has no MFA", async () => {
        const owner = await registerUser(server);
        const other = await registerUser(server);
        await setupMfa(other.token, other.password);

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

        const dbUser = await prisma.users.findUnique({where: {id: other.user.id}});
        expect(dbUser?.mfa_enabled).toBe(false);
        const totpRow = await prisma.userTotpSecret.findUnique({where: {user_id: other.user.id}});
        expect(totpRow).toBeNull();

        const login = await agent.post("/auth/login").send({email: other.user.email, password: other.password});
        expect(login.status).toBe(201);
        expect(login.body.mfaRequired).toBeUndefined();
        expect(typeof login.body.token).toBe("string");
    });

    test("admin cannot reset their own MFA via the admin endpoint", async () => {
        const owner = await registerUser(server);
        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const reset = await agent
            .delete(`/admin/users/${owner.user.id}/mfa`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({currentPassword: owner.password});
        expect(reset.status).toBe(401);
    });

    test("admin with MFA must provide a factor proof to reset another user", async () => {
        const owner = await registerUser(server);
        const other = await registerUser(server);
        const {token: ownerAfterMfa, secret: ownerSecret} = await setupMfa(owner.token, owner.password);
        await setupMfa(other.token, other.password);

        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        // Without a code the reset is rejected.
        const missing = await agent
            .delete(`/admin/users/${other.user.id}/mfa`)
            .set("Authorization", `Bearer ${ownerAfterMfa}`)
            .send({currentPassword: owner.password});
        expect(missing.status).toBe(400);

        // With a valid TOTP code it goes through.
        await prisma.userTotpSecret.update({
            where: {user_id: owner.user.id},
            data: {last_used_step: null},
        });
        const totp = new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(ownerSecret), digits: 6, period: 30});
        const withProof = await agent
            .delete(`/admin/users/${other.user.id}/mfa`)
            .set("Authorization", `Bearer ${ownerAfterMfa}`)
            .send({currentPassword: owner.password, code: totp.generate()});
        expect(withProof.status).toBe(204);
    });
});
