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

        const search = await agent.get("/transaction");
        expect(search.status).toBe(401);
        expect(search.body.message).toBe("Authorization token is missing");

        const create = await agent.post("/transaction/account/account-id").send({
            amount: 12.34,
            description: "Lunch",
            date: "2026-01-15T12:00:00.000Z",
        });
        expect(create.status).toBe(401);
        expect(create.body.message).toBe("Authorization token is missing");

        const bulkTest = await agent.post("/transaction/account/account-id/bulk/test").send([]);
        expect(bulkTest.status).toBe(401);
        expect(bulkTest.body.message).toBe("Authorization token is missing");

        const bulkCreate = await agent.post("/transaction/account/account-id/bulk").send([]);
        expect(bulkCreate.status).toBe(401);
        expect(bulkCreate.body.message).toBe("Authorization token is missing");

        const byId = await agent.get("/transaction/transaction-id");
        expect(byId.status).toBe(401);
        expect(byId.body.message).toBe("Authorization token is missing");

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
            .post(`/transaction/account/${account.body.id}`)
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

    test("accepts ISO date-only values on create", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Import Dates", type: "CHECKING"});

        expect(account.status).toBe(201);

        const create = await agent
            .post(`/transaction/account/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: -10,
                description: "CSV row",
                date: "2026-01-15",
            });

        expect(create.status).toBe(201);

        const stored = await prisma.transactions.findUnique({
            where: {id: create.body.id},
        });
        expect(stored?.date.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    });

    test("bulk test endpoint previews only duplicates already in database", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Bulk Preview", type: "CHECKING"});

        expect(account.status).toBe(201);

        const existing = {
            amount: -80.5,
            description: "Rent",
            date: "2026-02-01T09:00:00.000Z",
            isRebalance: false,
        };

        const firstInsert = await agent
            .post(`/transaction/account/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(existing);
        expect(firstInsert.status).toBe(201);

        const preview = await agent
            .post(`/transaction/account/${account.body.id}/bulk/test`)
            .set("Authorization", `Bearer ${user.token}`)
            .send([
                existing,
                {
                    amount: 2000,
                    description: "Salary",
                    date: "2026-02-02T08:00:00.000Z",
                },
            ]);

        expect(preview.status).toBe(200);
        expect(preview.body.wouldInsertCount).toBe(1);
        expect(preview.body.duplicates).toHaveLength(1);
        expect(preview.body.duplicates[0]).toEqual(expect.objectContaining(existing));
    });

    test("bulk create inserts only non-duplicates found in database", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Bulk Create", type: "CHECKING"});

        expect(account.status).toBe(201);

        const duplicateInDb = {
            amount: -19.99,
            description: "Streaming",
            date: "2026-02-10T10:00:00.000Z",
            isRebalance: false,
        };

        const existingInsert = await agent
            .post(`/transaction/account/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(duplicateInDb);
        expect(existingInsert.status).toBe(201);

        const bulk = await agent
            .post(`/transaction/account/${account.body.id}/bulk`)
            .set("Authorization", `Bearer ${user.token}`)
            .send([
                duplicateInDb,
                {
                    amount: 1500,
                    description: "Freelance",
                    date: "2026-02-11T10:00:00.000Z",
                },
                {
                    amount: -25,
                    description: "Dinner",
                    date: "2026-02-11T19:00:00.000Z",
                },
            ]);

        expect(bulk.status).toBe(201);
        expect(bulk.body.insertedCount).toBe(2);
        expect(bulk.body.duplicates).toHaveLength(1);
        expect(bulk.body.duplicates[0]).toEqual(expect.objectContaining(duplicateInDb));

        const storedTransactions = await prisma.transactions.findMany({
            where: {
                account_id: account.body.id,
            },
        });
        expect(storedTransactions).toHaveLength(3);

        const storedAccount = await prisma.accounts.findUnique({
            where: {id: account.body.id},
        });
        expect(storedAccount?.balance).toBe(1455.01);
    });

    test("bulk import accepts ISO date-only values and still detects duplicates", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "CSV Import", type: "CHECKING"});

        expect(account.status).toBe(201);

        const existing = await agent
            .post(`/transaction/account/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: -9.9,
                description: "Coffee",
                date: "2026-04-02",
            });
        expect(existing.status).toBe(201);

        const bulk = await agent
            .post(`/transaction/account/${account.body.id}/bulk`)
            .set("Authorization", `Bearer ${user.token}`)
            .send([
                {
                    amount: -9.9,
                    description: "Coffee",
                    date: "2026-04-02",
                },
                {
                    amount: 1200,
                    description: "Salary",
                    date: "2026-04-03",
                },
            ]);

        expect(bulk.status).toBe(201);
        expect(bulk.body.insertedCount).toBe(1);
        expect(bulk.body.duplicates).toHaveLength(1);

        const storedTransactions = await prisma.transactions.findMany({
            where: {account_id: account.body.id},
            orderBy: {date: "asc"},
        });
        expect(storedTransactions).toHaveLength(2);
        expect(storedTransactions[0]?.date.toISOString()).toBe("2026-04-02T00:00:00.000Z");
        expect(storedTransactions[1]?.date.toISOString()).toBe("2026-04-03T00:00:00.000Z");
    });

    test("bulk duplicate check ignores isRebalance when amount, description and date match", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Bulk Signature", type: "CHECKING"});

        expect(account.status).toBe(201);

        const existing = await agent
            .post(`/transaction/account/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: -42,
                description: "Internal transfer",
                date: "2026-04-10T08:30:00.000Z",
                isRebalance: false,
            });
        expect(existing.status).toBe(201);

        const bulk = await agent
            .post(`/transaction/account/${account.body.id}/bulk`)
            .set("Authorization", `Bearer ${user.token}`)
            .send([
                {
                    amount: -42,
                    description: "Internal transfer",
                    date: "2026-04-10T08:30:00.000Z",
                    isRebalance: true,
                },
            ]);

        expect(bulk.status).toBe(201);
        expect(bulk.body.insertedCount).toBe(0);
        expect(bulk.body.duplicates).toHaveLength(1);

        const storedTransactions = await prisma.transactions.findMany({
            where: {account_id: account.body.id},
        });
        expect(storedTransactions).toHaveLength(1);
    });

    test("bulk create keeps identical rows from payload when absent in database", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Bulk Same Rows", type: "CHECKING"});

        expect(account.status).toBe(201);

        const sameTx = {
            amount: -12.5,
            description: "Transfer",
            date: "2026-03-01T10:30:00.000Z",
        };

        const bulk = await agent
            .post(`/transaction/account/${account.body.id}/bulk`)
            .set("Authorization", `Bearer ${user.token}`)
            .send([sameTx, sameTx]);

        expect(bulk.status).toBe(201);
        expect(bulk.body.insertedCount).toBe(2);
        expect(bulk.body.duplicates).toHaveLength(0);

        const storedTransactions = await prisma.transactions.findMany({
            where: {
                account_id: account.body.id,
                description: "Transfer",
            },
        });
        expect(storedTransactions).toHaveLength(2);
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

        await agent.post(`/transaction/account/${accountA.body.id}`).set("Authorization", `Bearer ${userA.token}`).send({
            amount: 100,
            description: "Salary",
            date: "2026-01-01T08:00:00.000Z",
        });

        await agent.post(`/transaction/account/${accountB.body.id}`).set("Authorization", `Bearer ${userB.token}`).send({
            amount: 50,
            description: "Gift",
            date: "2026-01-02T08:00:00.000Z",
        });

        const listA = await agent.get("/transaction").set("Authorization", `Bearer ${userA.token}`);

        expect(listA.status).toBe(200);
        expect(listA.body.total).toBe(1);
        expect(listA.body.items).toHaveLength(1);
        expect(listA.body.items[0].description).toBe("Salary");
    });

    test("retrieves a transaction by id for owner", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Lookup", type: "CHECKING"});

        expect(account.status).toBe(201);

        const created = await agent
            .post(`/transaction/account/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: -12.4,
                description: "Book",
                date: "2026-03-12T10:00:00.000Z",
            });

        expect(created.status).toBe(201);

        const byId = await agent.get(`/transaction/${created.body.id}`).set("Authorization", `Bearer ${user.token}`);

        expect(byId.status).toBe(200);
        expect(byId.body.id).toBe(created.body.id);
        expect(byId.body.accountId).toBe(account.body.id);
        expect(byId.body.amount).toBe(-12.4);
        expect(byId.body.description).toBe("Book");
    });

    test("forbids retrieving another user's transaction", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Owner Account", type: "CHECKING"});

        expect(account.status).toBe(201);

        const created = await agent
            .post(`/transaction/account/${account.body.id}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({
                amount: 50,
                description: "Private",
                date: "2026-03-01T08:00:00.000Z",
            });

        expect(created.status).toBe(201);

        const byId = await agent.get(`/transaction/${created.body.id}`).set("Authorization", `Bearer ${outsider.token}`);

        expect(byId.status).toBe(403);
        expect(byId.body.message).toBe("You do not have permission to access this transaction");
    });

    test("searches transactions with frontend-like filters", async () => {
        const user = await registerUser(server);

        const accountA = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Checking", type: "CHECKING"});
        const accountB = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Savings", type: "SAVINGS"});

        expect(accountA.status).toBe(201);
        expect(accountB.status).toBe(201);

        const groceriesCategory = await prisma.userCategories.create({
            data: {
                user_id: user.user.id,
                name: "Groceries",
                hex_color: "#10B981",
                icon: "cart",
            },
        });
        const salaryCategory = await prisma.userCategories.create({
            data: {
                user_id: user.user.id,
                name: "Salary",
                hex_color: "#3B82F6",
                icon: "wallet",
            },
        });

        const marketMerchant = await prisma.userMerchants.create({
            data: {
                user_id: user.user.id,
                name: "Fresh Market",
            },
        });

        const expenseTx = await agent
            .post(`/transaction/account/${accountA.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: -42.2,
                description: "Weekly grocery run",
                date: "2026-02-15",
                categoryId: groceriesCategory.id,
                merchantId: marketMerchant.id,
                isRebalance: false,
            });
        expect(expenseTx.status).toBe(201);

        const incomeTx = await agent
            .post(`/transaction/account/${accountA.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: 2200,
                description: "Monthly salary",
                date: "2026-02-01",
                categoryId: salaryCategory.id,
                isRebalance: false,
            });
        expect(incomeTx.status).toBe(201);

        const rebalanceTx = await agent
            .post(`/transaction/account/${accountB.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: -100,
                description: "Transfer to savings",
                date: "2026-02-18",
                isRebalance: true,
            });
        expect(rebalanceTx.status).toBe(201);

        const response = await agent
            .get("/transaction")
            .query({
                search: "market",
                type: "expense",
                accountId: accountA.body.id,
                categoryId: groceriesCategory.id,
                merchantId: marketMerchant.id,
                rebalance: "exclude",
                startDate: "2026-02-10",
                endDate: "2026-02-20",
            })
            .set("Authorization", `Bearer ${user.token}`);

        expect(response.status).toBe(200);
        expect(response.body.isPaginated).toBe(false);
        expect(response.body.total).toBe(1);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0].id).toBe(expenseTx.body.id);
    });

    test("search endpoint supports optional pagination metadata", async () => {
        const user = await registerUser(server);

        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Pagination Account", type: "CHECKING"});
        expect(account.status).toBe(201);

        await agent.post(`/transaction/account/${account.body.id}`).set("Authorization", `Bearer ${user.token}`).send({
            amount: 100,
            description: "Salary",
            date: "2026-02-01",
        });
        await agent.post(`/transaction/account/${account.body.id}`).set("Authorization", `Bearer ${user.token}`).send({
            amount: -10,
            description: "Coffee",
            date: "2026-02-02",
        });
        await agent.post(`/transaction/account/${account.body.id}`).set("Authorization", `Bearer ${user.token}`).send({
            amount: -20,
            description: "Lunch",
            date: "2026-02-03",
        });

        const response = await agent
            .get("/transaction")
            .query({page: 2, pageSize: 1})
            .set("Authorization", `Bearer ${user.token}`);

        expect(response.status).toBe(200);
        expect(response.body.isPaginated).toBe(true);
        expect(response.body.total).toBe(3);
        expect(response.body.page).toBe(2);
        expect(response.body.pageSize).toBe(1);
        expect(response.body.totalPages).toBe(3);
        expect(response.body.items).toHaveLength(1);
    });

    test("rejects invalid search date range", async () => {
        const user = await registerUser(server);

        const response = await agent
            .get("/transaction")
            .query({startDate: "2026-03-15", endDate: "2026-03-01"})
            .set("Authorization", `Bearer ${user.token}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("startDate must be before or equal to endDate");
    });

    test("does not leak another user's account transactions when filtering by accountId", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Owner", type: "CHECKING"});

        expect(account.status).toBe(201);

        const list = await agent
            .get("/transaction")
            .query({accountId: account.body.id})
            .set("Authorization", `Bearer ${outsider.token}`);

        expect(list.status).toBe(200);
        expect(list.body.total).toBe(0);
        expect(list.body.items).toHaveLength(0);
    });

    test("updates a transaction and reconciles account balance", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Main", type: "CHECKING"});

        const create = await agent
            .post(`/transaction/account/${account.body.id}`)
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

    test("updates linked transfer transaction amount when edited", async () => {
        const user = await registerUser(server);

        const debitAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Checking", type: "CHECKING", balance: 200});
        const creditAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Savings", type: "SAVINGS", balance: 100});

        const transfer = await agent.post("/transfer").set("Authorization", `Bearer ${user.token}`).send({
            debitAccountId: debitAccount.body.id,
            creditAccountId: creditAccount.body.id,
            amount: 30,
            description: "Monthly transfer",
            date: "2026-02-10T10:00:00.000Z",
        });

        expect(transfer.status).toBe(201);

        const debitTransaction = transfer.body.find((item: {amount: number}) => item.amount < 0);
        const creditTransaction = transfer.body.find((item: {amount: number}) => item.amount > 0);
        expect(debitTransaction).toBeTruthy();
        expect(creditTransaction).toBeTruthy();

        const update = await agent
            .patch(`/transaction/${debitTransaction.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({amount: -50});

        expect(update.status).toBe(200);
        expect(update.body.amount).toBe(-50);

        const storedDebitTransaction = await prisma.transactions.findUnique({
            where: {id: debitTransaction.id},
        });
        const storedCreditTransaction = await prisma.transactions.findUnique({
            where: {id: creditTransaction.id},
        });

        expect(storedDebitTransaction?.amount).toBe(-50);
        expect(storedCreditTransaction?.amount).toBe(50);

        const storedDebitAccount = await prisma.accounts.findUnique({where: {id: debitAccount.body.id}});
        const storedCreditAccount = await prisma.accounts.findUnique({where: {id: creditAccount.body.id}});

        expect(storedDebitAccount?.balance).toBe(150);
        expect(storedCreditAccount?.balance).toBe(150);
    });

    test("updates linked transfer transaction date when edited", async () => {
        const user = await registerUser(server);

        const debitAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Checking", type: "CHECKING", balance: 200});
        const creditAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Savings", type: "SAVINGS", balance: 100});

        const transfer = await agent.post("/transfer").set("Authorization", `Bearer ${user.token}`).send({
            debitAccountId: debitAccount.body.id,
            creditAccountId: creditAccount.body.id,
            amount: 30,
            description: "Monthly transfer",
            date: "2026-02-10T10:00:00.000Z",
        });

        expect(transfer.status).toBe(201);

        const debitTransaction = transfer.body.find((item: {amount: number}) => item.amount < 0);
        const creditTransaction = transfer.body.find((item: {amount: number}) => item.amount > 0);
        expect(debitTransaction).toBeTruthy();
        expect(creditTransaction).toBeTruthy();

        const update = await agent
            .patch(`/transaction/${debitTransaction.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({date: "2026-03-12T15:30:00.000Z"});

        expect(update.status).toBe(200);
        expect(update.body.date).toBe("2026-03-12T15:30:00.000Z");

        const storedDebitTransaction = await prisma.transactions.findUnique({
            where: {id: debitTransaction.id},
        });
        const storedCreditTransaction = await prisma.transactions.findUnique({
            where: {id: creditTransaction.id},
        });

        expect(storedDebitTransaction?.date.toISOString()).toBe("2026-03-12T15:30:00.000Z");
        expect(storedCreditTransaction?.date.toISOString()).toBe("2026-03-12T15:30:00.000Z");

        const storedDebitAccount = await prisma.accounts.findUnique({where: {id: debitAccount.body.id}});
        const storedCreditAccount = await prisma.accounts.findUnique({where: {id: creditAccount.body.id}});

        expect(storedDebitAccount?.balance).toBe(170);
        expect(storedCreditAccount?.balance).toBe(130);
    });

    test("rejects sign flip when updating a linked transfer transaction", async () => {
        const user = await registerUser(server);

        const debitAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Checking", type: "CHECKING", balance: 200});
        const creditAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Savings", type: "SAVINGS", balance: 100});

        const transfer = await agent.post("/transfer").set("Authorization", `Bearer ${user.token}`).send({
            debitAccountId: debitAccount.body.id,
            creditAccountId: creditAccount.body.id,
            amount: 30,
            description: "Monthly transfer",
            date: "2026-02-10T10:00:00.000Z",
        });

        expect(transfer.status).toBe(201);

        const debitTransaction = transfer.body.find((item) => item.amount < 0);
        expect(debitTransaction).toBeTruthy();

        const update = await agent
            .patch(`/transaction/${debitTransaction.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({amount: 50});

        expect(update.status).toBe(400);
        expect(update.body.message).toBe("Cannot change sign of a transfer-linked transaction");

        const storedDebitTransaction = await prisma.transactions.findUnique({
            where: {id: debitTransaction.id},
        });
        expect(storedDebitTransaction?.amount).toBe(-30);
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

    test("deletes transfer transaction and keeps linked transaction by default", async () => {
        const user = await registerUser(server);

        const debitAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Checking", type: "CHECKING", balance: 200});
        const creditAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Savings", type: "SAVINGS", balance: 100});

        const transfer = await agent.post("/transfer").set("Authorization", `Bearer ${user.token}`).send({
            debitAccountId: debitAccount.body.id,
            creditAccountId: creditAccount.body.id,
            amount: 30,
            description: "Monthly transfer",
            date: "2026-02-10T10:00:00.000Z",
        });

        expect(transfer.status).toBe(201);

        const debitTransaction = transfer.body.find((item: {amount: number}) => item.amount < 0);
        const creditTransaction = transfer.body.find((item: {amount: number}) => item.amount > 0);
        expect(debitTransaction).toBeTruthy();
        expect(creditTransaction).toBeTruthy();

        const remove = await agent
            .delete(`/transaction/${debitTransaction.id}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(remove.status).toBe(204);

        const remainingTransactions = await prisma.transactions.findMany({
            where: {
                id: {in: [debitTransaction.id, creditTransaction.id]},
            },
        });
        expect(remainingTransactions).toHaveLength(1);
        expect(remainingTransactions[0]?.id).toBe(creditTransaction.id);

        const transferCount = await prisma.transfers.count();
        expect(transferCount).toBe(0);

        const storedDebitAccount = await prisma.accounts.findUnique({where: {id: debitAccount.body.id}});
        const storedCreditAccount = await prisma.accounts.findUnique({where: {id: creditAccount.body.id}});
        expect(storedDebitAccount?.balance).toBe(200);
        expect(storedCreditAccount?.balance).toBe(130);
    });

    test("deletes transfer transaction and linked transaction when keepLinkedTransaction=false", async () => {
        const user = await registerUser(server);

        const debitAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Checking", type: "CHECKING", balance: 200});
        const creditAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Savings", type: "SAVINGS", balance: 100});

        const transfer = await agent.post("/transfer").set("Authorization", `Bearer ${user.token}`).send({
            debitAccountId: debitAccount.body.id,
            creditAccountId: creditAccount.body.id,
            amount: 30,
            description: "Monthly transfer",
            date: "2026-02-10T10:00:00.000Z",
        });

        expect(transfer.status).toBe(201);

        const debitTransaction = transfer.body.find((item: {amount: number}) => item.amount < 0);
        const creditTransaction = transfer.body.find((item: {amount: number}) => item.amount > 0);
        expect(debitTransaction).toBeTruthy();
        expect(creditTransaction).toBeTruthy();

        const remove = await agent
            .delete(`/transaction/${debitTransaction.id}`)
            .query({keepLinkedTransaction: "false"})
            .set("Authorization", `Bearer ${user.token}`);
        expect(remove.status).toBe(204);

        const remainingTransactions = await prisma.transactions.findMany({
            where: {
                id: {in: [debitTransaction.id, creditTransaction.id]},
            },
        });
        expect(remainingTransactions).toHaveLength(0);

        const transferCount = await prisma.transfers.count();
        expect(transferCount).toBe(0);

        const storedDebitAccount = await prisma.accounts.findUnique({where: {id: debitAccount.body.id}});
        const storedCreditAccount = await prisma.accounts.findUnique({where: {id: creditAccount.body.id}});
        expect(storedDebitAccount?.balance).toBe(200);
        expect(storedCreditAccount?.balance).toBe(100);
    });

    test("rejects invalid keepLinkedTransaction query value", async () => {
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

        const remove = await agent
            .delete(`/transaction/${tx!.id}`)
            .query({keepLinkedTransaction: "not-a-boolean"})
            .set("Authorization", `Bearer ${user.token}`);

        expect(remove.status).toBe(400);
        expect(remove.body.message).toEqual(
            expect.arrayContaining([expect.objectContaining({property: "keepLinkedTransaction"})]),
        );
    });

    test("rejects invalid create payload", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Main", type: "CHECKING"});

        const create = await agent
            .post(`/transaction/account/${account.body.id}`)
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

    test("rejects creating transaction with zero amount", async () => {
        const user = await registerUser(server);
        const account = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Main", type: "CHECKING"});

        const create = await agent
            .post(`/transaction/account/${account.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: 0,
                description: "Should fail",
                date: "2026-01-15T12:00:00.000Z",
            });

        expect(create.status).toBe(400);
        expect(create.body.message).toEqual(expect.arrayContaining([expect.objectContaining({property: "amount"})]));
    });

    test("returns 404 when account or transaction does not exist", async () => {
        const user = await registerUser(server);
        const missingAccountId = "0195c8dd-c263-7569-99f6-9fc20aca3050";
        const missingTransactionId = "0195c8dd-c263-7569-99f6-9fc20aca3051";

        const byAccount = await agent
            .get("/transaction")
            .query({accountId: missingAccountId})
            .set("Authorization", `Bearer ${user.token}`);
        expect(byAccount.status).toBe(200);
        expect(byAccount.body.total).toBe(0);
        expect(byAccount.body.items).toHaveLength(0);

        const create = await agent
            .post(`/transaction/account/${missingAccountId}`)
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

        const byAccount = await agent
            .get("/transaction")
            .query({accountId: "not-a-uuid"})
            .set("Authorization", `Bearer ${user.token}`);
        expect(byAccount.status).toBe(400);

        const byId = await agent.get("/transaction/not-a-uuid").set("Authorization", `Bearer ${user.token}`);
        expect(byId.status).toBe(400);

        const create = await agent
            .post("/transaction/account/not-a-uuid")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
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
            .post(`/transaction/account/${account.body.id}`)
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
            .post(`/transaction/account/${ownerAccount.body.id}`)
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
            .post(`/transaction/account/${account.body.id}`)
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
