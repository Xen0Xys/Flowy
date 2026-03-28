import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import {config as loadEnv} from "dotenv";
import {afterAll, beforeAll, beforeEach, describe, expect, test} from "bun:test";
import {FastifyAdapter, NestFastifyApplication} from "@nestjs/platform-fastify";
import {ConfigKey, PrismaClient} from "../prisma/generated/client";
import {CustomValidationPipe} from "../src/common/pipes/validation.pipe";
import {AppModule} from "../src/app.module";
import {PrismaPg} from "@prisma/adapter-pg";
import {Test} from "@nestjs/testing";
import {Server} from "node:http";
import request from "supertest";
import {buildRegisterPayload, ensureInstanceConfig, PASSWORD_BASE} from "./test-utils";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
    loadEnv({path: envPath});
}

describe("AuthController (e2e)", () => {
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

        app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({exposeHeadRoutes: true}));
        app.useGlobalPipes(new CustomValidationPipe());
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
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
        await prisma?.$disconnect();
    });

    test("registers a user when registration is enabled", async () => {
        const payload = buildRegisterPayload();

        const response = await request(server).post("/user/register").send(payload);

        expect(response.status).toBe(201);
        expect(response.body.user.email).toBe(payload.email);
        expect(typeof response.body.token).toBe("string");
    });

    test("rejects duplicate email during registration", async () => {
        const payload = buildRegisterPayload();

        const firstAttempt = await request(server).post("/user/register").send(payload);
        expect(firstAttempt.status).toBe(201);

        const duplicateAttempt = await request(server)
            .post("/user/register")
            .send({...payload, username: `${payload.username}-2`});

        expect(duplicateAttempt.status).toBe(409);
        expect(duplicateAttempt.body.message).toContain("Username or email already exists");
    });

    test("rejects registration when registration is disabled", async () => {
        await prisma.config.update({
            where: {key: ConfigKey.REGISTRATION_ENABLED},
            data: {value: "false"},
        });

        const payload = buildRegisterPayload();
        const response = await request(server).post("/user/register").send(payload);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Registration is disabled on this instance");
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
        const login = await request(server).post("/user/register").send(payload);

        expect(login.status).toBe(201);
        const token = login.body.token;

        const response = await request(server).get("/user/me").set("Authorization", `Bearer ${token}`);

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
        const response = await request(server).get("/user/me").set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token");
    });

    test("responds with 500 when registration config is missing", async () => {
        await prisma.config.delete({
            where: {key: ConfigKey.REGISTRATION_ENABLED},
        });

        try {
            const payload = buildRegisterPayload();
            const response = await request(server).post("/user/register").send(payload);

            expect(response.status).toBe(500);
            expect(response.body.message).toBe("Registration configuration not found");
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

        const register = await request(server).post("/user/register").send(payload);
        expect(register.status).toBe(201);

        const dbUser = await prisma.users.findFirst({
            where: {email: payload.email},
        });
        expect(dbUser).not.toBeNull();
        expect(dbUser?.password).not.toBe(payload.password);
        expect(dbUser?.password.startsWith("$argon2")).toBe(true);
    });

    test("invalidates current token on logout/all", async () => {
        const payload = buildRegisterPayload();
        const register = await request(server).post("/user/register").send(payload);
        expect(register.status).toBe(201);

        const token = register.body.token as string;

        const logout = await request(server).delete("/user/logout/all").set("Authorization", `Bearer ${token}`);
        expect(logout.status).toBe(204);

        const meWithOldToken = await request(server).get("/user/me").set("Authorization", `Bearer ${token}`);
        expect(meWithOldToken.status).toBe(401);
        expect(meWithOldToken.body.message).toBe("Invalid or expired token");

        const relogin = await request(server).post("/user/login").send({
            email: payload.email,
            password: payload.password,
        });
        expect(relogin.status).toBe(201);
        expect(typeof relogin.body.token).toBe("string");
    });

    test("rejects logout/all without token", async () => {
        const response = await request(server).delete("/user/logout/all");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Authorization token is missing");
    });

    test("rejects logout/all with invalid token", async () => {
        const response = await request(server).delete("/user/logout/all").set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token");
    });
});
