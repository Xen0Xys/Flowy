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
import {ensureInstanceConfig, registerUser} from "./test-utils";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
    loadEnv({path: envPath});
}

let app: NestFastifyApplication;
let server: Server;
let prisma: PrismaClient;

describe("AccountController (e2e)", () => {
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
        await prisma.transactions.deleteMany();
        await prisma.accounts.deleteMany();
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
        await prisma.familyInvites.deleteMany();
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

    test("requires authentication for account routes", async () => {
        const list = await request(server).get("/account");
        expect(list.status).toBe(401);
        expect(list.body.message).toBe("Authorization token is missing");

        const byId = await request(server).get("/account/any-id");
        expect(byId.status).toBe(401);
        expect(byId.body.message).toBe("Authorization token is missing");

        const create = await request(server).post("/account").send({
            name: "Main",
            type: "CHECKING",
            balance: 10,
        });
        expect(create.status).toBe(401);
        expect(create.body.message).toBe("Authorization token is missing");

        const remove = await request(server).delete("/account/any-id");
        expect(remove.status).toBe(401);
        expect(remove.body.message).toBe("Authorization token is missing");
    });

    test("rejects invalid token for protected account routes", async () => {
        const response = await request(server)
            .get("/account")
            .set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token");
    });

    test("creates an account", async () => {
        const user = await registerUser(server);

        const create = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Main checking", type: "CHECKING", balance: 1523.45});

        expect(create.status).toBe(201);
        expect(create.body.name).toBe("Main checking");
        expect(create.body.type).toBe("CHECKING");
        expect(create.body.balance).toBe(1523.45);
    });

    test("lists only current user's accounts", async () => {
        const userA = await registerUser(server);
        const userB = await registerUser(server);

        const createA = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${userA.token}`)
            .send({name: "Main checking", type: "CHECKING", balance: 1523.45});
        expect(createA.status).toBe(201);

        const createB = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${userB.token}`)
            .send({name: "Savings B", type: "SAVINGS", balance: 10});
        expect(createB.status).toBe(201);

        const accountsA = await request(server)
            .get("/account")
            .set("Authorization", `Bearer ${userA.token}`);
        expect(accountsA.status).toBe(200);
        expect(accountsA.body).toHaveLength(1);
        expect(accountsA.body[0].id).toBe(createA.body.id);

        const accountsB = await request(server)
            .get("/account")
            .set("Authorization", `Bearer ${userB.token}`);
        expect(accountsB.status).toBe(200);
        expect(accountsB.body).toHaveLength(1);
        expect(accountsB.body[0].id).toBe(createB.body.id);
    });

    test("creates an account with default balance when omitted", async () => {
        const user = await registerUser(server);

        const response = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Cash wallet", type: "CASH"});

        expect(response.status).toBe(201);
        expect(response.body.balance).toBe(0);
    });

    test("rejects invalid create account payloads", async () => {
        const user = await registerUser(server);

        const response = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "ab",
                type: "INVALID_TYPE",
                balance: 10.123,
            });

        expect(response.status).toBe(400);
        expect(Array.isArray(response.body.message)).toBe(true);
        expect(response.body.message).toEqual(
            expect.arrayContaining([
                expect.objectContaining({property: "name"}),
                expect.objectContaining({property: "type"}),
                expect.objectContaining({property: "balance"}),
            ]),
        );
    });

    test("gets account by id and rejects foreign account access", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const created = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Owner account", type: "INVESTMENT", balance: 9.99});
        expect(created.status).toBe(201);

        const mine = await request(server)
            .get(`/account/${created.body.id}`)
            .set("Authorization", `Bearer ${owner.token}`);
        expect(mine.status).toBe(200);
        expect(mine.body.id).toBe(created.body.id);

        const forbidden = await request(server)
            .get(`/account/${created.body.id}`)
            .set("Authorization", `Bearer ${outsider.token}`);
        expect(forbidden.status).toBe(403);
        expect(forbidden.body.message).toBe(
            "You do not have permission to delete this account",
        );
    });

    test("returns 404 when account is not found", async () => {
        const user = await registerUser(server);
        const fakeId = "e7f531e0-c8d0-4fef-a5e5-8b5f9cd9240f";

        const byId = await request(server)
            .get(`/account/${fakeId}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(byId.status).toBe(404);
        expect(byId.body.message).toBe("Account not found");

        const remove = await request(server)
            .delete(`/account/${fakeId}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(remove.status).toBe(404);
        expect(remove.body.message).toBe("Account not found");
    });

    test("deletes own account and removes it from subsequent listing", async () => {
        const user = await registerUser(server);
        const create = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Disposable", type: "OTHER", balance: 1});
        expect(create.status).toBe(201);

        const remove = await request(server)
            .delete(`/account/${create.body.id}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect([200, 204]).toContain(remove.status);

        const list = await request(server)
            .get("/account")
            .set("Authorization", `Bearer ${user.token}`);
        expect(list.status).toBe(200);
        expect(list.body).toHaveLength(0);
    });

    test("rejects account deletion when requester is not the owner", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const create = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Private", type: "CHECKING", balance: 77});
        expect(create.status).toBe(201);

        const remove = await request(server)
            .delete(`/account/${create.body.id}`)
            .set("Authorization", `Bearer ${outsider.token}`);

        expect(remove.status).toBe(403);
        expect(remove.body.message).toBe(
            "You do not have permission to delete this account",
        );
    });
});
