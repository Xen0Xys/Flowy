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
import crypto from "node:crypto";
import request from "supertest";

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
        await ensureRegistrationEnabled(prisma);

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
        await prisma.familyMembers.deleteMany();
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
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
});

function buildRegisterPayload(
    overrides: Partial<{
        username: string;
        email: string;
        password: string;
    }> = {},
) {
    const fallbackPassword = "SuiteP@ss1";
    const unique = crypto.randomUUID();
    return {
        username: overrides.username ?? `user-${unique.slice(0, 8)}`,
        email: overrides.email ?? `user-${unique}@e2e.test`,
        password: overrides.password ?? fallbackPassword,
    };
}

async function ensureRegistrationEnabled(prisma: PrismaClient) {
    await prisma.config.upsert({
        where: {key: ConfigKey.SELF_HOSTED},
        update: {value: "true"},
        create: {key: ConfigKey.SELF_HOSTED, value: "true"},
    });
    await prisma.config.upsert({
        where: {key: ConfigKey.REGISTRATION_ENABLED},
        update: {value: "true"},
        create: {key: ConfigKey.REGISTRATION_ENABLED, value: "true"},
    });
}
