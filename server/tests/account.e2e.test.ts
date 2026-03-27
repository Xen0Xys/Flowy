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

        app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({exposeHeadRoutes: true}));
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

        const update = await request(server).patch("/account/any-id").send({
            name: "Updated",
        });
        expect(update.status).toBe(401);
        expect(update.body.message).toBe("Authorization token is missing");

        const evolution = await request(server).get(
            "/account/any-id/evolution?startDate=2025-01-01T00:00:00.000Z&endDate=2025-01-31T23:59:59.999Z",
        );
        expect(evolution.status).toBe(401);
        expect(evolution.body.message).toBe("Authorization token is missing");
    });

    test("rejects invalid token for protected account routes", async () => {
        const response = await request(server).get("/account").set("Authorization", "Bearer invalid-token");

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

        const transactions = await prisma.transactions.findMany({
            where: {account_id: create.body.id},
        });
        expect(transactions).toHaveLength(1);
        expect(transactions[0].amount).toBe(1523.45);
        expect(transactions[0].is_rebalance).toBe(true);
        expect(transactions[0].description).toBe("Account rebalance adjustment");
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

        const accountsA = await request(server).get("/account").set("Authorization", `Bearer ${userA.token}`);
        expect(accountsA.status).toBe(200);
        expect(accountsA.body).toHaveLength(1);
        expect(accountsA.body[0].id).toBe(createA.body.id);

        const accountsB = await request(server).get("/account").set("Authorization", `Bearer ${userB.token}`);
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

        const response = await request(server).post("/account").set("Authorization", `Bearer ${user.token}`).send({
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
        expect(forbidden.body.message).toBe("You do not have permission to delete this account");
    });

    test("returns 404 when account is not found", async () => {
        const user = await registerUser(server);
        const fakeId: string = "019d2f14-e490-732f-8732-cdcbac41f0ab";

        const byId = await request(server).get(`/account/${fakeId}`).set("Authorization", `Bearer ${user.token}`);
        expect(byId.status).toBe(404);
        expect(byId.body.message).toBe("Account not found");

        const remove = await request(server).delete(`/account/${fakeId}`).set("Authorization", `Bearer ${user.token}`);
        expect(remove.status).toBe(404);
        expect(remove.body.message).toBe("Account not found");

        const update = await request(server)
            .patch(`/account/${fakeId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Updated"});
        expect(update.status).toBe(404);
        expect(update.body.message).toBe("Account not found");
    });

    test("updates account name and type", async () => {
        const user = await registerUser(server);
        const create = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Starter", type: "CHECKING", balance: 120});
        expect(create.status).toBe(201);

        const update = await request(server)
            .patch(`/account/${create.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Primary", type: "SAVINGS"});

        expect(update.status).toBe(200);
        expect(update.body.id).toBe(create.body.id);
        expect(update.body.name).toBe("Primary");
        expect(update.body.type).toBe("SAVINGS");
        expect(update.body.balance).toBe(120);
    });

    test("updates account balance and creates rebalance transaction", async () => {
        const user = await registerUser(server);
        const create = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Rebalance", type: "CHECKING", balance: 100});
        expect(create.status).toBe(201);

        const update = await request(server)
            .patch(`/account/${create.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({balance: 150.25});

        expect(update.status).toBe(200);
        expect(update.body.balance).toBe(150.25);

        const transactions = await prisma.transactions.findMany({
            where: {account_id: create.body.id},
            orderBy: {date: "asc"},
        });
        expect(transactions).toHaveLength(2);
        expect(transactions[0].amount).toBe(100);
        expect(transactions[1].amount).toBe(50.25);
        expect(transactions[0].is_rebalance).toBe(true);
        expect(transactions[1].is_rebalance).toBe(true);
        expect(transactions[1].description).toBe("Account rebalance adjustment");
    });

    test("rejects account update when requester is not the owner", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const create = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Private", type: "CHECKING", balance: 20});
        expect(create.status).toBe(201);

        const update = await request(server)
            .patch(`/account/${create.body.id}`)
            .set("Authorization", `Bearer ${outsider.token}`)
            .send({name: "Hacked"});

        expect(update.status).toBe(403);
        expect(update.body.message).toBe("You do not have permission to update this account");
    });

    test("rejects invalid update account payloads", async () => {
        const user = await registerUser(server);
        const create = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Main", type: "CHECKING", balance: 10});
        expect(create.status).toBe(201);

        const response = await request(server)
            .patch(`/account/${create.body.id}`)
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

    test("returns account balance evolution in date order for range", async () => {
        const user = await registerUser(server);
        const create = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "History", type: "CHECKING", balance: 0});
        expect(create.status).toBe(201);

        const accountId = create.body.id;
        const beforeRange = new Date("2025-01-01T08:00:00.000Z");
        const inRangeA = new Date("2025-01-10T10:00:00.000Z");
        const inRangeB = new Date("2025-01-20T12:30:00.000Z");
        const afterRange = new Date("2025-02-01T09:00:00.000Z");

        await prisma.transactions.createMany({
            data: [
                {
                    account_id: accountId,
                    amount: 100,
                    description: "Before range",
                    date: beforeRange,
                },
                {
                    account_id: accountId,
                    amount: -35,
                    description: "In range A",
                    date: inRangeA,
                },
                {
                    account_id: accountId,
                    amount: 20.5,
                    description: "In range B",
                    date: inRangeB,
                },
                {
                    account_id: accountId,
                    amount: 999,
                    description: "After range",
                    date: afterRange,
                },
            ],
        });

        const response = await request(server)
            .get(`/account/${accountId}/evolution?startDate=2025-01-10T00:00:00.000Z&endDate=2025-01-31T23:59:59.999Z`)
            .set("Authorization", `Bearer ${user.token}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(22);
        expect(response.body[0].date).toBe("2025-01-10T00:00:00.000Z");
        expect(response.body[0].balance).toBe(65);
        expect(response.body[9].date).toBe("2025-01-19T00:00:00.000Z");
        expect(response.body[9].balance).toBe(65);
        expect(response.body[10].date).toBe("2025-01-20T00:00:00.000Z");
        expect(response.body[10].balance).toBe(85.5);
        expect(response.body[21].date).toBe("2025-01-31T00:00:00.000Z");
        expect(response.body[21].balance).toBe(85.5);
    });

    test("rejects balance evolution access when requester is not owner", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const create = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Private history", type: "CHECKING", balance: 50});
        expect(create.status).toBe(201);

        const response = await request(server)
            .get(
                `/account/${create.body.id}/evolution?startDate=2025-01-01T00:00:00.000Z&endDate=2025-01-31T23:59:59.999Z`,
            )
            .set("Authorization", `Bearer ${outsider.token}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toBe("You do not have permission to access this account");
    });

    test("rejects invalid balance evolution date query", async () => {
        const user = await registerUser(server);
        const create = await request(server)
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Date checks", type: "CHECKING", balance: 10});
        expect(create.status).toBe(201);

        const invalidDate = await request(server)
            .get(`/account/${create.body.id}/evolution?startDate=not-a-date&endDate=2025-01-31T23:59:59.999Z`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(invalidDate.status).toBe(400);
        expect(Array.isArray(invalidDate.body.message)).toBe(true);
        expect(invalidDate.body.message).toEqual(
            expect.arrayContaining([expect.objectContaining({property: "startDate"})]),
        );

        const invalidRange = await request(server)
            .get(
                `/account/${create.body.id}/evolution?startDate=2025-02-01T00:00:00.000Z&endDate=2025-01-01T00:00:00.000Z`,
            )
            .set("Authorization", `Bearer ${user.token}`);
        expect(invalidRange.status).toBe(400);
        expect(invalidRange.body.message).toBe("startDate must be before endDate");
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

        const list = await request(server).get("/account").set("Authorization", `Bearer ${user.token}`);
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
        expect(remove.body.message).toBe("You do not have permission to delete this account");
    });
});
