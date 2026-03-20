import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import {config as loadEnv} from "dotenv";
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
} from "bun:test";
import {FastifyAdapter, NestFastifyApplication} from "@nestjs/platform-fastify";
import {ConfigKey, PrismaClient} from "../prisma/generated/client";
import {CustomValidationPipe} from "../src/common/pipes/validation.pipe";
import {AppModule} from "../src/app.module";
import {PrismaPg} from "@prisma/adapter-pg";
import {Test} from "@nestjs/testing";
import {Server} from "node:http";
import request from "supertest";
import {
    buildRegisterPayload,
    ensureInstanceConfig,
    PASSWORD_BASE,
} from "./test-utils";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
    loadEnv({path: envPath});
}

describe("UserController (e2e)", () => {
    let app: NestFastifyApplication;
    let server: Server;
    let prisma: PrismaClient;

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

        app = moduleRef.createNestApplication<NestFastifyApplication>(
            new FastifyAdapter({exposeHeadRoutes: true}),
        );
        app.useGlobalPipes(new CustomValidationPipe());
        await app.init();
        const instance = app.getHttpAdapter().getInstance();
        await instance.ready();
        server = instance.server;
    });

    beforeEach(async () => {
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
        await prisma.family.deleteMany();
        await prisma.config.update({
            where: {key: ConfigKey.REGISTRATION_ENABLED},
            data: {value: "true"},
        });
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
        await prisma?.$disconnect();
    });

    test("registers a user when registration is enabled", async () => {
        const payload = buildRegisterPayload();

        const response = await request(server)
            .post("/user/register")
            .send(payload);

        expect(response.status).toBe(201);
        expect(response.body.user.email).toBe(payload.email);
        expect(typeof response.body.token).toBe("string");
    });

    test("rejects duplicate email during registration", async () => {
        const payload = buildRegisterPayload();

        const firstAttempt = await request(server)
            .post("/user/register")
            .send(payload);
        expect(firstAttempt.status).toBe(201);

        const duplicateAttempt = await request(server)
            .post("/user/register")
            .send({...payload, username: `${payload.username}-2`});

        expect(duplicateAttempt.status).toBe(409);
        expect(duplicateAttempt.body.message).toContain(
            "Username or email already exists",
        );
    });

    test("rejects registration when registration is disabled", async () => {
        await prisma.config.update({
            where: {key: ConfigKey.REGISTRATION_ENABLED},
            data: {value: "false"},
        });

        const payload = buildRegisterPayload();
        const response = await request(server)
            .post("/user/register")
            .send(payload);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Registration is disabled on this instance",
        );
    });

    test("rejects invalid registration payload", async () => {
        const response = await request(server).post("/user/register").send({
            username: "ab",
            email: "not-an-email",
            password: "weak",
        });

        expect(response.status).toBe(400);
        expect(Array.isArray(response.body.message)).toBe(true);
        expect(response.body.message).toEqual(
            expect.arrayContaining([
                expect.objectContaining({property: "username"}),
                expect.objectContaining({property: "email"}),
                expect.objectContaining({property: "password"}),
            ]),
        );
    });

    test("logs in an existing user", async () => {
        const payload = buildRegisterPayload();
        await request(server).post("/user/register").send(payload);

        const response = await request(server)
            .post("/user/login")
            .send({email: payload.email, password: payload.password});

        expect(response.status).toBe(201);
        expect(response.body.user.email).toBe(payload.email);
        expect(typeof response.body.token).toBe("string");
    });

    test("rejects invalid login credentials", async () => {
        const response = await request(server).post("/user/login").send({
            email: "unknown@test.com",
            password: "WrongP@ss1",
        });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid email or password");
    });

    test("returns current user when token is valid", async () => {
        const payload = buildRegisterPayload();
        const login = await request(server)
            .post("/user/register")
            .send(payload);

        expect(login.status).toBe(201);
        const token = login.body.token;

        const response = await request(server)
            .get("/user/me")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.email).toBe(payload.email);
        expect(response.body).not.toHaveProperty("password");
    });

    test("rejects access to /user/me without token", async () => {
        const response = await request(server).get("/user/me");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Authorization token is missing");
    });

    test("rejects access to /user/me with invalid token", async () => {
        const response = await request(server)
            .get("/user/me")
            .set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token");
    });

    test("responds with 500 when registration config is missing", async () => {
        await prisma.config.delete({
            where: {key: ConfigKey.REGISTRATION_ENABLED},
        });

        try {
            const payload = buildRegisterPayload();
            const response = await request(server)
                .post("/user/register")
                .send(payload);

            expect(response.status).toBe(500);
            expect(response.body.message).toBe(
                "Registration configuration not found",
            );
        } finally {
            await prisma.config.upsert({
                where: {key: ConfigKey.REGISTRATION_ENABLED},
                update: {value: "true"},
                create: {
                    key: ConfigKey.REGISTRATION_ENABLED,
                    value: "true",
                },
            });
        }
    });
    test("stores passwords hashed in DB (not plain text)", async () => {
        const payload = buildRegisterPayload({
            password: `NotPlain${PASSWORD_BASE}`,
        });

        const register = await request(server)
            .post("/user/register")
            .send(payload);
        expect(register.status).toBe(201);

        const dbUser = await prisma.users.findFirst({
            where: {email: payload.email},
        });
        expect(dbUser).not.toBeNull();
        // should not store plain password
        expect(dbUser?.password).not.toBe(payload.password);
        // expect argon2 hash prefix
        expect(dbUser?.password.startsWith("$argon2")).toBe(true);
    });

    test("updates username when authenticated and validates conflicts", async () => {
        const a = buildRegisterPayload();
        const b = buildRegisterPayload();

        const regA = await request(server).post("/user/register").send(a);
        expect(regA.status).toBe(201);
        const tokenA = regA.body.token;

        const regB = await request(server).post("/user/register").send(b);
        expect(regB.status).toBe(201);

        // successful update
        const newUsername = `new-${a.username}`;
        const upd = await request(server)
            .patch("/user/me/username")
            .set("Authorization", `Bearer ${tokenA}`)
            .send({username: newUsername});
        expect(upd.status).toBe(200);
        expect(upd.body.username).toBe(newUsername);

        // conflict with existing username
        const conflict = await request(server)
            .patch("/user/me/username")
            .set("Authorization", `Bearer ${tokenA}`)
            .send({username: regB.body.user.username});
        expect(conflict.status).toBe(409);
        expect(conflict.body.message).toContain(
            "Username or email already exists",
        );
    });

    test("updates email when authenticated and validates conflicts", async () => {
        const a = buildRegisterPayload();
        const b = buildRegisterPayload();

        const regA = await request(server).post("/user/register").send(a);
        expect(regA.status).toBe(201);
        const tokenA = regA.body.token;

        const regB = await request(server).post("/user/register").send(b);
        expect(regB.status).toBe(201);

        const newEmail = `changed-${a.email}`;
        const upd = await request(server)
            .patch("/user/me/email")
            .set("Authorization", `Bearer ${tokenA}`)
            .send({email: newEmail});
        expect(upd.status).toBe(200);
        expect(upd.body.email).toBe(newEmail);

        const conflict = await request(server)
            .patch("/user/me/email")
            .set("Authorization", `Bearer ${tokenA}`)
            .send({email: regB.body.user.email});
        expect(conflict.status).toBe(409);
        expect(conflict.body.message).toContain(
            "Username or email already exists",
        );
    });

    test("changes password and keeps existing tokens valid", async () => {
        const payload = buildRegisterPayload({password: `Old${PASSWORD_BASE}`});
        const reg = await request(server).post("/user/register").send(payload);
        expect(reg.status).toBe(201);
        const oldToken = reg.body.token;

        // change password
        const change = await request(server)
            .patch("/user/me/password")
            .set("Authorization", `Bearer ${oldToken}`)
            .send({
                currentPassword: payload.password,
                newPassword: `New${PASSWORD_BASE}`,
            });
        expect(change.status).toBe(200);

        // old token should still be valid (we no longer rotate jwt_id on password change)
        const now = await request(server)
            .get("/user/me")
            .set("Authorization", `Bearer ${oldToken}`);
        expect(now.status).toBe(200);
        expect(now.body.email).toBe(payload.email);

        // login with new password also works
        const login = await request(server)
            .post("/user/login")
            .send({email: payload.email, password: `New${PASSWORD_BASE}`});
        expect(login.status).toBe(201);
        expect(typeof login.body.token).toBe("string");

        const me = await request(server)
            .get("/user/me")
            .set("Authorization", `Bearer ${login.body.token}`);
        expect(me.status).toBe(200);
        expect(me.body.email).toBe(payload.email);
    });

    test("rejects password change with wrong current password or weak new password", async () => {
        const payload = buildRegisterPayload({
            password: `Right${PASSWORD_BASE}`,
        });
        const reg = await request(server).post("/user/register").send(payload);
        expect(reg.status).toBe(201);
        const token = reg.body.token;

        // wrong current password
        const wrong = await request(server)
            .patch("/user/me/password")
            .set("Authorization", `Bearer ${token}`)
            .send({
                currentPassword: "Incorrect1",
                newPassword: `Another${PASSWORD_BASE}`,
            });
        expect(wrong.status).toBe(403);
        expect(wrong.body.message).toBe("Invalid current password");

        // weak new password should be rejected by validation
        const weak = await request(server)
            .patch("/user/me/password")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: payload.password, newPassword: "weak"});
        expect(weak.status).toBe(400);
        expect(Array.isArray(weak.body.message)).toBe(true);
        expect(weak.body.message).toEqual(
            expect.arrayContaining([
                expect.objectContaining({property: "newPassword"}),
            ]),
        );
    });

    // Additional admin-related tests (edge cases)
    test("user cannot access admin endpoints even if token present", async () => {
        const payload = buildRegisterPayload();
        const reg = await request(server).post("/user/register").send(payload);
        expect(reg.status).toBe(201);

        const resp = await request(server)
            .get("/admin/users")
            .set("Authorization", `Bearer ${reg.body.token}`);
        expect(resp.status).toBe(401);
    });

    test("deletes own account when providing correct current password", async () => {
        const payload = buildRegisterPayload();
        const reg = await request(server).post("/user/register").send(payload);
        expect(reg.status).toBe(201);
        const token = reg.body.token;

        const del = await request(server)
            .delete("/user/me")
            .set("Authorization", `Bearer ${token}`)
            .send({currentPassword: payload.password});

        expect(del.status).toBe(204);

        const dbUser = await prisma.users.findFirst({
            where: {email: payload.email},
        });
        expect(dbUser).toBeNull();

        // token should no longer authenticate (user removed)
        const me = await request(server)
            .get("/user/me")
            .set("Authorization", `Bearer ${token}`);
        expect(me.status).toBe(401);
    });

    test("rejects account deletion with wrong current password", async () => {
        const payload = buildRegisterPayload();
        const reg = await request(server).post("/user/register").send(payload);
        expect(reg.status).toBe(201);
        const token = reg.body.token;

        const del = await request(server)
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
        const reg = await request(server).post("/user/register").send(payload);
        expect(reg.status).toBe(201);

        const without = await request(server).delete("/user/me");
        expect(without.status).toBe(401);
        expect(without.body.message).toBe("Authorization token is missing");

        const invalid = await request(server)
            .delete("/user/me")
            .set("Authorization", "Bearer invalid-token")
            .send({currentPassword: payload.password});
        expect(invalid.status).toBe(401);
        expect(invalid.body.message).toBe("Invalid or expired token");
    });
});
