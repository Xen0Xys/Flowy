import "reflect-metadata";
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

describe("AuthController (e2e)", () => {
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

    test("registers a user when registration is enabled", async () => {
        const payload = buildRegisterPayload();

        const response = await agent.post("/auth/register").send(payload);

        expect(response.status).toBe(201);
        expect(response.body.user.email).toBe(payload.email);
        expect(typeof response.body.token).toBe("string");
    });

    test("rejects duplicate email during registration", async () => {
        const payload = buildRegisterPayload();

        const firstAttempt = await agent.post("/auth/register").send(payload);
        expect(firstAttempt.status).toBe(201);

        const duplicateAttempt = await agent
            .post("/auth/register")
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
        const response = await agent.post("/auth/register").send(payload);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Registration is disabled on this instance");
    });

    test("rejects invalid registration payload", async () => {
        const response = await agent.post("/auth/register").send({
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
        await agent.post("/auth/register").send(payload);

        const response = await agent.post("/auth/login").send({email: payload.email, password: payload.password});

        expect(response.status).toBe(201);
        expect(response.body.user.email).toBe(payload.email);
        expect(typeof response.body.token).toBe("string");
    });

    test("rejects invalid login credentials", async () => {
        const response = await agent.post("/auth/login").send({
            email: "unknown@test.com",
            password: "WrongP@ss1",
        });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid email or password");
    });

    test("returns current user when token is valid", async () => {
        const payload = buildRegisterPayload();
        const login = await agent.post("/auth/register").send(payload);

        expect(login.status).toBe(201);
        const token = login.body.token;

        const response = await agent.get("/user/me").set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.email).toBe(payload.email);
        expect(response.body).not.toHaveProperty("password");
    });

    test("rejects access to /user/me without token", async () => {
        const response = await agent.get("/user/me");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Authorization token is missing");
    });

    test("rejects access to /user/me with invalid token", async () => {
        const response = await agent.get("/user/me").set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token");
    });

    test("responds with 500 when registration config is missing", async () => {
        await prisma.config.delete({
            where: {key: ConfigKey.REGISTRATION_ENABLED},
        });

        try {
            const payload = buildRegisterPayload();
            const response = await agent.post("/auth/register").send(payload);

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

        const register = await agent.post("/auth/register").send(payload);
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
        const register = await agent.post("/auth/register").send(payload);
        expect(register.status).toBe(201);

        const token = register.body.token as string;

        const logout = await agent.delete("/auth/logout/all").set("Authorization", `Bearer ${token}`);
        expect(logout.status).toBe(204);

        const meWithOldToken = await agent.get("/user/me").set("Authorization", `Bearer ${token}`);
        expect(meWithOldToken.status).toBe(401);
        expect(meWithOldToken.body.message).toBe("Invalid or expired token");

        const relogin = await agent.post("/auth/login").send({
            email: payload.email,
            password: payload.password,
        });
        expect(relogin.status).toBe(201);
        expect(typeof relogin.body.token).toBe("string");
    });

    test("rejects logout/all without token", async () => {
        const response = await agent.delete("/auth/logout/all");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Authorization token is missing");
    });

    test("rejects logout/all with invalid token", async () => {
        const response = await agent.delete("/auth/logout/all").set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token");
    });

    test("blocks register and login when csrf token is missing", async () => {
        const payload = buildRegisterPayload();

        const registerResponse = await request(server).post("/auth/register").send(payload);
        expect(registerResponse.status).toBe(403);

        const loginResponse = await request(server)
            .post("/auth/login")
            .send({email: payload.email, password: payload.password});
        expect(loginResponse.status).toBe(403);
    });

    test("blocks authenticated mutating request when csrf token is missing", async () => {
        const payload = buildRegisterPayload();
        const registerResponse = await agent.post("/auth/register").send(payload);
        expect(registerResponse.status).toBe(201);

        const logoutResponse = await request(server)
            .delete("/auth/logout/all")
            .set("Authorization", `Bearer ${registerResponse.body.token}`);
        expect(logoutResponse.status).toBe(403);
    });
});
