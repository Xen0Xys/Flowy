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
import {createCsrfAgent, ensureInstanceConfig, registerUser} from "./test-utils";

let app: NestFastifyApplication;
let server: Server;
let prisma: PrismaClient;
let agent: ReturnType<typeof request.agent>;

describe("TransactionController (e2e)", () => {
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
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
        await prisma.familyInvites.deleteMany();
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

    test("requires authentication for transaction routes", async () => {
        const list = await agent.get("/transaction");
        expect(list.status).toBe(401);
        expect(list.body.message).toBe("Authorization token is missing");

        const byAccount = await agent.get("/transaction/account-id");
        expect(byAccount.status).toBe(401);
        expect(byAccount.body.message).toBe("Authorization token is missing");

        const create = await agent.post("/transaction/account-id").send({
            amount: 12.34,
            description: "Lunch",
            date: "2026-01-15T12:00:00.000Z",
        });
        expect(create.status).toBe(401);
        expect(create.body.message).toBe("Authorization token is missing");

        const update = await agent.patch("/transaction/transaction-id").send({description: "Updated"});
        expect(update.status).toBe(401);
        expect(update.body.message).toBe("Authorization token is missing");

        const remove = await agent.delete("/transaction/transaction-id");
        expect(remove.status).toBe(401);
        expect(remove.body.message).toBe("Authorization token is missing");
    });

    test("creates a transaction and updates account balance", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Everyday", type: "CHECKING"});

        expect(account.status).toBe(201);

        const create = await agent
            .post(`/transaction/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: -42.35,
                description: "Groceries",
                date: "2026-01-15T12:00:00.000Z",
            });

        expect(create.status).toBe(201);
        expect(create.body.amount).toBe(-42.35);
        expect(create.body.description).toBe("Groceries");
        expect(create.body.accountId).toBe(account.body.id);

        const storedAccount = await prisma.accounts.findUnique({
            where: {id: account.body.id},
        });
        expect(storedAccount?.balance).toBe(-42.35);
    });

    test("lists only current user's transactions", async () => {
        const userA = await registerUser(server);
        const userB = await registerUser(server);

        const accountA = await agent
            .post("/account")
            .set("Authorization", `Bearer ${userA.token}`)
            .send({name: "Account A", type: "CHECKING"});
        const accountB = await agent
            .post("/account")
            .set("Authorization", `Bearer ${userB.token}`)
            .send({name: "Account B", type: "CHECKING"});

        expect(accountA.status).toBe(201);
        expect(accountB.status).toBe(201);

        await agent.post(`/transaction/${accountA.body.id}`).set("Authorization", `Bearer ${userA.token}`).send({
            amount: 100,
            description: "Salary",
            date: "2026-01-01T08:00:00.000Z",
        });

        await agent.post(`/transaction/${accountB.body.id}`).set("Authorization", `Bearer ${userB.token}`).send({
            amount: 50,
            description: "Gift",
            date: "2026-01-02T08:00:00.000Z",
        });

        const listA = await agent.get("/transaction").set("Authorization", `Bearer ${userA.token}`);

        expect(listA.status).toBe(200);
        expect(listA.body).toHaveLength(1);
        expect(listA.body[0].description).toBe("Salary");
    });

    test("forbids access to another user's account transactions", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Owner", type: "CHECKING"});

        expect(account.status).toBe(201);

        const list = await agent.get(`/transaction/${account.body.id}`).set("Authorization", `Bearer ${outsider.token}`);

        expect(list.status).toBe(403);
        expect(list.body.message).toBe("You do not have permission to access this account");
    });

    test("updates a transaction and reconciles account balance", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Main", type: "CHECKING"});

        const create = await agent
            .post(`/transaction/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: 20,
                description: "Initial",
                date: "2026-01-10T12:00:00.000Z",
            });

        expect(create.status).toBe(201);

        const update = await agent
            .patch(`/transaction/${create.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({amount: 45.2, description: "Updated"});

        expect(update.status).toBe(200);
        expect(update.body.amount).toBe(45.2);
        expect(update.body.description).toBe("Updated");

        const storedAccount = await prisma.accounts.findUnique({
            where: {id: account.body.id},
        });
        expect(storedAccount?.balance).toBe(45.2);
    });

    test("deletes a transaction and reverts account balance", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Main", type: "CHECKING", balance: 100});

        const tx = await prisma.transactions.findFirst({
            where: {
                account_id: account.body.id,
                is_rebalance: true,
            },
        });

        expect(tx).not.toBeNull();

        const remove = await agent.delete(`/transaction/${tx!.id}`).set("Authorization", `Bearer ${user.token}`);

        expect(remove.status).toBe(204);

        const storedAccount = await prisma.accounts.findUnique({
            where: {id: account.body.id},
        });
        expect(storedAccount?.balance).toBe(0);
    });

    test("rejects invalid create payload", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Main", type: "CHECKING"});

        const create = await agent
            .post(`/transaction/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: 10.999,
                description: "",
                date: "invalid-date",
            });

        expect(create.status).toBe(400);
        expect(create.body.message).toEqual(
            expect.arrayContaining([
                expect.objectContaining({property: "amount"}),
                expect.objectContaining({property: "description"}),
                expect.objectContaining({property: "date"}),
            ]),
        );
    });

    test("returns 404 when account or transaction does not exist", async () => {
        const user = await registerUser(server);
        const missingAccountId = "0195c8dd-c263-7569-99f6-9fc20aca3050";
        const missingTransactionId = "0195c8dd-c263-7569-99f6-9fc20aca3051";

        const byAccount = await agent
            .get(`/transaction/${missingAccountId}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(byAccount.status).toBe(404);
        expect(byAccount.body.message).toBe("Account not found");

        const create = await agent
            .post(`/transaction/${missingAccountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: 10,
                description: "Ghost account",
                date: "2026-01-15T12:00:00.000Z",
            });
        expect(create.status).toBe(404);
        expect(create.body.message).toBe("Account not found");

        const update = await agent
            .patch(`/transaction/${missingTransactionId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({description: "Nope"});
        expect(update.status).toBe(404);
        expect(update.body.message).toBe("Transaction not found");

        const remove = await agent
            .delete(`/transaction/${missingTransactionId}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(remove.status).toBe(404);
        expect(remove.body.message).toBe("Transaction not found");
    });

    test("rejects invalid UUID v7 params on protected routes", async () => {
        const user = await registerUser(server);

        const byAccount = await agent.get("/transaction/not-a-uuid").set("Authorization", `Bearer ${user.token}`);
        expect(byAccount.status).toBe(400);

        const create = await agent.post("/transaction/not-a-uuid").set("Authorization", `Bearer ${user.token}`).send({
            amount: 10,
            description: "Bad id",
            date: "2026-01-15T12:00:00.000Z",
        });
        expect(create.status).toBe(400);

        const update = await agent
            .patch("/transaction/not-a-uuid")
            .set("Authorization", `Bearer ${user.token}`)
            .send({description: "Bad id"});
        expect(update.status).toBe(400);

        const remove = await agent.delete("/transaction/not-a-uuid").set("Authorization", `Bearer ${user.token}`);
        expect(remove.status).toBe(400);
    });

    test("forbids updating and deleting another user's transaction", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Owner Main", type: "CHECKING"});

        const create = await agent
            .post(`/transaction/${account.body.id}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({
                amount: 35,
                description: "Owner transaction",
                date: "2026-01-15T12:00:00.000Z",
            });
        expect(create.status).toBe(201);

        const update = await agent
            .patch(`/transaction/${create.body.id}`)
            .set("Authorization", `Bearer ${outsider.token}`)
            .send({description: "Hacked"});
        expect(update.status).toBe(403);
        expect(update.body.message).toBe("You do not have permission to update this transaction");

        const remove = await agent
            .delete(`/transaction/${create.body.id}`)
            .set("Authorization", `Bearer ${outsider.token}`);
        expect(remove.status).toBe(403);
        expect(remove.body.message).toBe("You do not have permission to delete this transaction");
    });

    test("rejects merchant/category from another user", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const ownerAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Owner Wallet", type: "CHECKING"});

        const outsiderMerchant = await prisma.userMerchants.create({
            data: {
                user_id: outsider.user.id,
                name: "Outsider merchant",
            },
        });
        const outsiderCategory = await prisma.userCategories.create({
            data: {
                user_id: outsider.user.id,
                name: "Outsider category",
                hex_color: "#123456",
                icon: "wallet",
            },
        });

        const create = await agent
            .post(`/transaction/${ownerAccount.body.id}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({
                amount: 12,
                description: "Should fail",
                date: "2026-01-15T12:00:00.000Z",
                merchantId: outsiderMerchant.id,
                categoryId: outsiderCategory.id,
            });

        expect(create.status).toBe(404);
        expect(["Merchant not found", "Category not found"]).toContain(create.body.message);
    });

    test("allows assigning then clearing merchant/category references", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Main Wallet", type: "CHECKING"});

        const merchant = await prisma.userMerchants.create({
            data: {
                user_id: user.user.id,
                name: "Local Shop",
            },
        });
        const category = await prisma.userCategories.create({
            data: {
                user_id: user.user.id,
                name: "Food",
                hex_color: "#10B981",
                icon: "utensils",
            },
        });

        const create = await agent
            .post(`/transaction/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: 25,
                description: "Dinner",
                date: "2026-01-20T20:00:00.000Z",
                merchantId: merchant.id,
                categoryId: category.id,
            });
        expect(create.status).toBe(201);
        expect(create.body.merchant?.id).toBe(merchant.id);
        expect(create.body.category?.id).toBe(category.id);

        const clear = await agent
            .patch(`/transaction/${create.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({merchantId: null, categoryId: null});
        expect(clear.status).toBe(200);
        expect(clear.body.merchant).toBeUndefined();
        expect(clear.body.category).toBeUndefined();
    });
});
