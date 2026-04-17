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
import {buildRegisterPayload, createCsrfAgent, ensureInstanceConfig, registerUser} from "./test-utils";

describe("CSRF protection (e2e)", () => {
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
        await prisma.transactions.deleteMany();
        await prisma.accounts.deleteMany();
        await prisma.userCategories.deleteMany();
        await prisma.userMerchants.deleteMany();
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

    test("blocks auth register when CSRF token is missing", async () => {
        const payload = buildRegisterPayload();

        const response = await request(server).post("/auth/register").send(payload);

        expect(response.status).toBe(403);
        expect(response.body.message).toContain("csrf");
    });

    test("blocks auth register when CSRF token is invalid", async () => {
        const payload = buildRegisterPayload();

        const response = await request(server).post("/auth/register").set("x-csrf-token", "invalid-token").send(payload);

        expect(response.status).toBe(403);
    });

    test("allows auth register when CSRF token is valid", async () => {
        const payload = buildRegisterPayload();

        const response = await agent.post("/auth/register").send(payload);

        expect(response.status).toBe(201);
        expect(typeof response.body.token).toBe("string");
    });

    test("blocks authenticated mutating route without CSRF token", async () => {
        const user = await registerUser(server);

        const response = await request(server)
            .post("/family/create")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "NoCsrfFamily", currency: "EUR"});

        expect(response.status).toBe(403);
        expect(response.body.message).toContain("csrf");
    });

    test("does not require CSRF token for authenticated GET route", async () => {
        const user = await registerUser(server);

        const response = await request(server).get("/user/me").set("Authorization", `Bearer ${user.token}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(user.user.id);
    });
});
