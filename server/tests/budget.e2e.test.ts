// oxlint-disable-next-line import/no-unassigned-import
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
import {createCsrfAgent, ensureInstanceConfig, registerUser} from "./test-utils";

let app: NestFastifyApplication;
let server: Server;
let prisma: PrismaClient;
let agent: ReturnType<typeof request.agent>;

async function createAccount(userToken: string, name = "Main"): Promise<{id: string}> {
    const res = await agent
        .post("/account")
        .set("Authorization", `Bearer ${userToken}`)
        .send({name, type: "CHECKING", balance: 0});
    if (res.status !== 201) throw new Error(`createAccount failed: ${res.status} ${JSON.stringify(res.body)}`);
    return {id: res.body.id};
}

async function createCategory(userToken: string, name = "Groceries"): Promise<{id: string}> {
    const res = await agent
        .post("/reference/category")
        .set("Authorization", `Bearer ${userToken}`)
        .send({name, hexColor: "#ff0000", icon: "iconoir:cart"});
    if (res.status !== 201) throw new Error(`createCategory failed: ${res.status} ${JSON.stringify(res.body)}`);
    return {id: res.body.id};
}

describe("BudgetController (e2e)", () => {
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
        await prisma.transfers.deleteMany();
        await prisma.transactions.deleteMany();
        await prisma.budgetedCategories.deleteMany();
        await prisma.budgetAccounts.deleteMany();
        await prisma.budgets.deleteMany();
        await prisma.accountShares.deleteMany();
        await prisma.userCategories.deleteMany();
        await prisma.userMerchants.deleteMany();
        await prisma.accounts.deleteMany();
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

    // ─── Authentication ───────────────────────────────────────────────

    test("requires authentication for all budget routes", async () => {
        const getResponse = await agent.get("/budget/2026/3");
        expect(getResponse.status).toBe(401);

        const renewableResponse = await agent.get("/budget/renewable");
        expect(renewableResponse.status).toBe(401);

        const postResponse = await agent.post("/budget").send({
            month: 3,
            year: 2026,
            budgetedIncome: 100,
            categories: [],
            accountIds: [],
        });
        expect(postResponse.status).toBe(401);

        const spendingResponse = await agent.get("/budget/0195c8dd-c263-7569-99f6-9fc20aca3050/spending");
        expect(spendingResponse.status).toBe(401);

        const putResponse = await agent.put("/budget/0195c8dd-c263-7569-99f6-9fc20aca3050").send({});
        expect(putResponse.status).toBe(401);

        const deleteResponse = await agent.delete("/budget/0195c8dd-c263-7569-99f6-9fc20aca3050");
        expect(deleteResponse.status).toBe(401);
    });

    // ─── GET /budget/:year/:month ─────────────────────────────────────

    test("returns empty array when no budget exists for the period", async () => {
        const user = await registerUser(server);
        const response = await agent.get("/budget/2026/3").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    test("returns budgets for the requested period", async () => {
        const user = await registerUser(server);
        const account = await createAccount(user.token);
        const category = await createCategory(user.token);

        const created = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 3000,
                categories: [{categoryId: category.id, amount: 500}],
                accountIds: [account.id],
            });
        expect(created.status).toBe(201);

        const response = await agent.get("/budget/2026/3").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].id).toBe(created.body.id);
        expect(response.body[0].budgetedIncome).toBe(3000);
        expect(response.body[0].accountIds).toEqual([account.id]);
        expect(response.body[0].effectivePermission).toBe("owner");
    });

    test("does not return another user's budget for the same period", async () => {
        const userA = await registerUser(server);
        const userB = await registerUser(server);
        const accountA = await createAccount(userA.token);
        const catA = await createCategory(userA.token);

        await agent
            .post("/budget")
            .set("Authorization", `Bearer ${userA.token}`)
            .send({
                month: 5,
                year: 2026,
                budgetedIncome: 5000,
                categories: [{categoryId: catA.id, amount: 400}],
                accountIds: [accountA.id],
            });

        const response = await agent.get("/budget/2026/5").set("Authorization", `Bearer ${userB.token}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    test("allows multiple budgets in the same month for the same user", async () => {
        const user = await registerUser(server);
        const account1 = await createAccount(user.token, "Perso");
        const account2 = await createAccount(user.token, "Commun");
        const category = await createCategory(user.token);

        const b1 = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "Perso",
                month: 4,
                year: 2026,
                budgetedIncome: 2000,
                categories: [{categoryId: category.id, amount: 400}],
                accountIds: [account1.id],
            });
        expect(b1.status).toBe(201);

        const b2 = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "Commun",
                month: 4,
                year: 2026,
                budgetedIncome: 3500,
                categories: [{categoryId: category.id, amount: 700}],
                accountIds: [account2.id],
            });
        expect(b2.status).toBe(201);

        const list = await agent.get("/budget/2026/4").set("Authorization", `Bearer ${user.token}`);
        expect(list.status).toBe(200);
        expect(list.body).toHaveLength(2);
        expect(list.body.map((b: {name: string}) => b.name).sort()).toEqual(["Commun", "Perso"]);
    });

    // ─── Validation ────────────────────────────────────────────────────

    test("rejects creation without at least one account", async () => {
        const user = await registerUser(server);
        const category = await createCategory(user.token);

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [{categoryId: category.id, amount: 50}],
                accountIds: [],
            });
        expect(response.status).toBe(400);
    });

    test("rejects creation with duplicate categories", async () => {
        const user = await registerUser(server);
        const account = await createAccount(user.token);
        const category = await createCategory(user.token);

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [
                    {categoryId: category.id, amount: 50},
                    {categoryId: category.id, amount: 60},
                ],
                accountIds: [account.id],
            });
        expect(response.status).toBe(400);
    });

    test("rejects creation with categories from another user", async () => {
        const user = await registerUser(server);
        const other = await registerUser(server);
        const account = await createAccount(user.token);
        const foreignCategory = await createCategory(other.token, "Foreign");

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [{categoryId: foreignCategory.id, amount: 50}],
                accountIds: [account.id],
            });
        expect(response.status).toBe(400);
    });

    test("rejects creation mixing accounts from different owners", async () => {
        const owner1 = await registerUser(server);
        const owner2 = await registerUser(server);
        const account1 = await createAccount(owner1.token);
        const account2 = await createAccount(owner2.token);
        const category = await createCategory(owner1.token);

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${owner1.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [{categoryId: category.id, amount: 50}],
                accountIds: [account1.id, account2.id],
            });
        // account2 is not accessible to owner1 → rejected before the mono-owner check.
        expect(response.status).toBe(400);
    });

    // ─── Update ────────────────────────────────────────────────────────

    test("updates a budget name, income and categories", async () => {
        const user = await registerUser(server);
        const account = await createAccount(user.token);
        const cat1 = await createCategory(user.token, "Groceries");
        const cat2 = await createCategory(user.token, "Bills");

        const created = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 3000,
                categories: [{categoryId: cat1.id, amount: 500}],
                accountIds: [account.id],
            });

        const updated = await agent
            .put(`/budget/${created.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "Renamed",
                budgetedIncome: 3500,
                categories: [
                    {categoryId: cat1.id, amount: 600},
                    {categoryId: cat2.id, amount: 200},
                ],
            });
        expect(updated.status).toBe(200);
        expect(updated.body.name).toBe("Renamed");
        expect(updated.body.budgetedIncome).toBe(3500);
        expect(updated.body.budgetedCategories).toHaveLength(2);
    });

    test("forbids updating another user's budget", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);
        const account = await createAccount(owner.token);
        const category = await createCategory(owner.token);

        const created = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 3000,
                categories: [{categoryId: category.id, amount: 500}],
                accountIds: [account.id],
            });

        const forbidden = await agent
            .put(`/budget/${created.body.id}`)
            .set("Authorization", `Bearer ${outsider.token}`)
            .send({budgetedIncome: 100});
        expect(forbidden.status).toBe(403);
    });

    test("deletes own budget", async () => {
        const user = await registerUser(server);
        const account = await createAccount(user.token);
        const category = await createCategory(user.token);

        const created = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 3000,
                categories: [{categoryId: category.id, amount: 500}],
                accountIds: [account.id],
            });

        const del = await agent.delete(`/budget/${created.body.id}`).set("Authorization", `Bearer ${user.token}`);
        expect(del.status).toBe(204);

        const list = await agent.get("/budget/2026/3").set("Authorization", `Bearer ${user.token}`);
        expect(list.body).toEqual([]);
    });

    // ─── Spending ──────────────────────────────────────────────────────

    test("returns 404 for spending on a non-existent budget", async () => {
        const user = await registerUser(server);
        const missing = "0195c8dd-c263-7569-99f6-9fc20aca3050";
        const response = await agent.get(`/budget/${missing}/spending`).set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(404);
    });

    test("aggregates spending only for the budget's own accounts", async () => {
        const user = await registerUser(server);
        const scopedAccount = await createAccount(user.token, "Scoped");
        const outsideAccount = await createAccount(user.token, "Outside");
        const category = await createCategory(user.token);

        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth() + 1;

        const scoped = await agent
            .post(`/transaction/account/${scopedAccount.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: -120,
                description: "Scoped expense",
                date: new Date(year, month - 1, 15).toISOString(),
                categoryId: category.id,
                inBudget: true,
            });
        expect(scoped.status).toBe(201);

        const outside = await agent
            .post(`/transaction/account/${outsideAccount.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                amount: -300,
                description: "Outside expense",
                date: new Date(year, month - 1, 15).toISOString(),
                categoryId: category.id,
                inBudget: true,
            });
        expect(outside.status).toBe(201);

        const budget = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month,
                year,
                budgetedIncome: 2000,
                categories: [{categoryId: category.id, amount: 500}],
                accountIds: [scopedAccount.id],
            });

        const spending = await agent
            .get(`/budget/${budget.body.id}/spending`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(spending.status).toBe(200);
        expect(spending.body.totalSpent).toBeCloseTo(120, 2);
    });

    // ─── renewable ─────────────────────────────────────────────────────

    test("deletes an orphan budget when its last account is deleted", async () => {
        const user = await registerUser(server);
        const account = await createAccount(user.token);
        const category = await createCategory(user.token);

        const budget = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 1000,
                categories: [{categoryId: category.id, amount: 100}],
                accountIds: [account.id],
            });
        expect(budget.status).toBe(201);

        const del = await agent.delete(`/account/${account.id}`).set("Authorization", `Bearer ${user.token}`);
        expect(del.status).toBe(200);

        const list = await agent.get("/budget/2026/3").set("Authorization", `Bearer ${user.token}`);
        expect(list.status).toBe(200);
        expect(list.body).toEqual([]);
    });

    test("keeps a budget when only some of its accounts are deleted", async () => {
        const user = await registerUser(server);
        const account1 = await createAccount(user.token, "Keep");
        const account2 = await createAccount(user.token, "Drop");
        const category = await createCategory(user.token);

        const budget = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 1000,
                categories: [{categoryId: category.id, amount: 100}],
                accountIds: [account1.id, account2.id],
            });
        expect(budget.status).toBe(201);

        const del = await agent.delete(`/account/${account2.id}`).set("Authorization", `Bearer ${user.token}`);
        expect(del.status).toBe(200);

        const list = await agent.get("/budget/2026/3").set("Authorization", `Bearer ${user.token}`);
        expect(list.status).toBe(200);
        expect(list.body).toHaveLength(1);
        expect(list.body[0].accountIds).toEqual([account1.id]);
    });

    test("returns each renewable budget in a period", async () => {
        const user = await registerUser(server);
        const account = await createAccount(user.token);
        const category = await createCategory(user.token);

        const first = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 2,
                year: 2026,
                budgetedIncome: 1000,
                categories: [{categoryId: category.id, amount: 100}],
                accountIds: [account.id],
            });
        expect(first.status).toBe(201);

        const second = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "Second",
                month: 2,
                year: 2026,
                budgetedIncome: 1500,
                categories: [{categoryId: category.id, amount: 200}],
                accountIds: [account.id],
            });
        expect(second.status).toBe(201);

        const renewable = await agent.get("/budget/renewable").set("Authorization", `Bearer ${user.token}`);
        expect(renewable.status).toBe(200);
        expect(renewable.body).toHaveLength(2);
        const ids = renewable.body.map((b: {id: string}) => b.id).sort();
        expect(ids).toEqual([first.body.id, second.body.id].sort());
        for (const entry of renewable.body) {
            expect(entry.month).toBe(2);
            expect(entry.year).toBe(2026);
            expect(entry.effectivePermission).toBe("owner");
        }
    });
});
