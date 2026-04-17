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
import {buildRegisterPayload, createCsrfAgent, ensureInstanceConfig, PASSWORD_BASE} from "./test-utils";

describe("UserController (e2e)", () => {
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
        if (app) {
            await app.close();
        }
        await prisma?.$disconnect();
    });

    test("updates username when authenticated and validates conflicts", async () => {
        const a = buildRegisterPayload();
        const b = buildRegisterPayload();

        const regA = await agent.post("/auth/register").send(a);
        expect(regA.status).toBe(201);
        const tokenA = regA.body.token;

        const regB = await agent.post("/auth/register").send(b);
        expect(regB.status).toBe(201);

        // successful update
        const newUsername = `new-${a.username}`;
        const upd = await agent
            .patch("/user/me/username")
            .set("Authorization", `Bearer ${tokenA}`)
            .send({username: newUsername});
        expect(upd.status).toBe(200);
        expect(upd.body.username).toBe(newUsername);

        // conflict with existing username
        const conflict = await agent
            .patch("/user/me/username")
            .set("Authorization", `Bearer ${tokenA}`)
            .send({username: regB.body.user.username});
        expect(conflict.status).toBe(409);
        expect(conflict.body.message).toContain("Username or email already exists");
    });

    test("updates email when authenticated and validates conflicts", async () => {
        const a = buildRegisterPayload();
        const b = buildRegisterPayload();

        const regA = await agent.post("/auth/register").send(a);
        expect(regA.status).toBe(201);
        const tokenA = regA.body.token;

        const regB = await agent.post("/auth/register").send(b);
        expect(regB.status).toBe(201);

        const newEmail = `changed-${a.email}`;
        const upd = await agent.patch("/user/me/email").set("Authorization", `Bearer ${tokenA}`).send({email: newEmail});
        expect(upd.status).toBe(200);
        expect(upd.body.email).toBe(newEmail);

        const conflict = await agent
            .patch("/user/me/email")
            .set("Authorization", `Bearer ${tokenA}`)
            .send({email: regB.body.user.email});
        expect(conflict.status).toBe(409);
        expect(conflict.body.message).toContain("Username or email already exists");
    });

    test("changes password and keeps existing tokens valid", async () => {
        const payload = buildRegisterPayload({password: `Old${PASSWORD_BASE}`});
        const reg = await agent.post("/auth/register").send(payload);
        expect(reg.status).toBe(201);
        const oldToken = reg.body.token;

        // change password
        const change = await agent
            .patch("/user/me/password")
            .set("Authorization", `Bearer ${oldToken}`)
            .send({
                currentPassword: payload.password,
                newPassword: `New${PASSWORD_BASE}`,
            });
        expect(change.status).toBe(200);

        // old token should still be valid (we no longer rotate jwt_id on password change)
        const now = await agent.get("/user/me").set("Authorization", `Bearer ${oldToken}`);
        expect(now.status).toBe(200);
        expect(now.body.email).toBe(payload.email);

        // login with new password also works
        const login = await agent.post("/auth/login").send({email: payload.email, password: `New${PASSWORD_BASE}`});
        expect(login.status).toBe(201);
        expect(typeof login.body.token).toBe("string");

        const me = await agent.get("/user/me").set("Authorization", `Bearer ${login.body.token}`);
        expect(me.status).toBe(200);
        expect(me.body.email).toBe(payload.email);
    });

    test("rejects password change with wrong current password or weak new password", async () => {
        const payload = buildRegisterPayload({
            password: `Right${PASSWORD_BASE}`,
        });
        const reg = await agent.post("/auth/register").send(payload);
        expect(reg.status).toBe(201);
        const token = reg.body.token;

        // wrong current password
        const wrong = await agent
            .patch("/user/me/password")
            .set("Authorization", `Bearer ${token}`)
            .send({
                currentPassword: "Incorrect1",
                newPassword: `Another${PASSWORD_BASE}`,
            });
        expect(wrong.status).toBe(403);
        expect(wrong.body.message).toBe("Invalid current password");

        // weak new password should be rejected by validation
        const weak = await agent
            .patch("/user/me/password")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: payload.password, newPassword: "weak"});
        expect(weak.status).toBe(400);
        expect(Array.isArray(weak.body.message)).toBe(true);
        expect(weak.body.message).toEqual(expect.arrayContaining([expect.objectContaining({property: "newPassword"})]));
    });

    // Additional admin-related tests (edge cases)
    test("user cannot access admin endpoints even if token present", async () => {
        const payload = buildRegisterPayload();
        const reg = await agent.post("/auth/register").send(payload);
        expect(reg.status).toBe(201);

        const resp = await agent.get("/admin/users").set("Authorization", `Bearer ${reg.body.token}`);
        expect(resp.status).toBe(401);
    });

    test("deletes own account when providing correct current password", async () => {
        const payload = buildRegisterPayload();
        const reg = await agent.post("/auth/register").send(payload);
        expect(reg.status).toBe(201);
        const token = reg.body.token;

        const del = await agent
            .delete("/user/me")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: payload.password});

        expect(del.status).toBe(204);

        const dbUser = await prisma.users.findFirst({
            where: {email: payload.email},
        });
        expect(dbUser).toBeNull();

        // token should no longer authenticate (user removed)
        const me = await agent.get("/user/me").set("Authorization", `Bearer ${token}`);
        expect(me.status).toBe(401);
    });

    test("rejects account deletion with wrong current password", async () => {
        const payload = buildRegisterPayload();
        const reg = await agent.post("/auth/register").send(payload);
        expect(reg.status).toBe(201);
        const token = reg.body.token;

        const del = await agent
            .delete("/user/me")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: "incorrect-password"});

        expect(del.status).toBe(403);
        expect(del.body.message).toBe("Invalid current password");

        const dbUser = await prisma.users.findFirst({
            where: {email: payload.email},
        });
        expect(dbUser).not.toBeNull();
    });

    test("rejects delete account without or with invalid token", async () => {
        const payload = buildRegisterPayload();
        const reg = await agent.post("/auth/register").send(payload);
        expect(reg.status).toBe(201);

        const without = await agent.delete("/user/me");
        expect(without.status).toBe(401);
        expect(without.body.message).toBe("Authorization token is missing");

        const invalid = await agent
            .delete("/user/me")
            .set("Authorization", "Bearer invalid-token")
            .send({currentPassword: payload.password});
        expect(invalid.status).toBe(401);
        expect(invalid.body.message).toBe("Invalid or expired token");
    });
});
