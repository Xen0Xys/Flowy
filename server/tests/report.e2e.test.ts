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

interface SeededUser {
    token: string;
    userId: string;
    checkingId: string;
    savingsId: string;
    groceriesId: string;
    salaryId: string;
    storeAId: string;
    storeBId: string;
}

async function seedUser(usernameHint: string): Promise<SeededUser> {
    const registered = await registerUser(server, {username: `report-${usernameHint}`});
    const token = registered.token;
    const userId = registered.user.id;

    const checking = await agent
        .post("/account")
        .set("Authorization", `Bearer ${token}`)
        .send({name: "Checking", type: "CHECKING", balance: 0});
    if (checking.status !== 201) throw new Error(`checking failed: ${checking.status}`);

    const savings = await agent
        .post("/account")
        .set("Authorization", `Bearer ${token}`)
        .send({name: "Savings", type: "SAVINGS", balance: 0});
    if (savings.status !== 201) throw new Error(`savings failed: ${savings.status}`);

    const groceries = await agent
        .post("/reference/category")
        .set("Authorization", `Bearer ${token}`)
        .send({name: "Groceries", hexColor: "#ff0000", icon: "iconoir:cart"});
    if (groceries.status !== 201) throw new Error(`groceries failed: ${groceries.status}`);

    const salary = await agent
        .post("/reference/category")
        .set("Authorization", `Bearer ${token}`)
        .send({name: "Salary", hexColor: "#00ff00", icon: "iconoir:coin"});
    if (salary.status !== 201) throw new Error(`salary failed: ${salary.status}`);

    const storeA = await agent
        .post("/reference/merchant")
        .set("Authorization", `Bearer ${token}`)
        .send({name: "Store A"});
    if (storeA.status !== 201) throw new Error(`storeA failed: ${storeA.status}`);

    const storeB = await agent
        .post("/reference/merchant")
        .set("Authorization", `Bearer ${token}`)
        .send({name: "Store B"});
    if (storeB.status !== 201) throw new Error(`storeB failed: ${storeB.status}`);

    return {
        token,
        userId,
        checkingId: checking.body.id,
        savingsId: savings.body.id,
        groceriesId: groceries.body.id,
        salaryId: salary.body.id,
        storeAId: storeA.body.id,
        storeBId: storeB.body.id,
    };
}

async function seedTransactions(u: SeededUser): Promise<void> {
    // February 2026 (previous period) — 1 income, 2 expenses
    await prisma.transactions.createMany({
        data: [
            {
                account_id: u.checkingId,
                amount: 1000,
                description: "Salary Feb",
                date: new Date("2026-02-15T12:00:00.000Z"),
                category_id: u.salaryId,
                merchant_id: null,
                in_budget: true,
                is_rebalance: false,
            },
            {
                account_id: u.checkingId,
                amount: -80,
                description: "Store A Feb",
                date: new Date("2026-02-20T12:00:00.000Z"),
                category_id: u.groceriesId,
                merchant_id: u.storeAId,
                in_budget: true,
                is_rebalance: false,
            },
            {
                account_id: u.checkingId,
                amount: -30,
                description: "Uncategorized Feb",
                date: new Date("2026-02-25T12:00:00.000Z"),
                category_id: null,
                merchant_id: null,
                in_budget: true,
                is_rebalance: false,
            },
        ],
    });

    // March 2026 (current period)
    await prisma.transactions.createMany({
        data: [
            {
                account_id: u.checkingId,
                amount: 2000,
                description: "Salary Mar",
                date: new Date("2026-03-01T12:00:00.000Z"),
                category_id: u.salaryId,
                merchant_id: null,
                in_budget: true,
                is_rebalance: false,
            },
            {
                account_id: u.checkingId,
                amount: -100,
                description: "Store A Mar 1",
                date: new Date("2026-03-05T12:00:00.000Z"),
                category_id: u.groceriesId,
                merchant_id: u.storeAId,
                in_budget: true,
                is_rebalance: false,
            },
            {
                account_id: u.checkingId,
                amount: -50,
                description: "Store B Mar",
                date: new Date("2026-03-10T12:00:00.000Z"),
                category_id: u.groceriesId,
                merchant_id: u.storeBId,
                in_budget: true,
                is_rebalance: false,
            },
            {
                account_id: u.checkingId,
                amount: -25,
                description: "Uncategorized Mar",
                date: new Date("2026-03-15T12:00:00.000Z"),
                category_id: null,
                merchant_id: null,
                in_budget: false,
                is_rebalance: false,
            },
            {
                account_id: u.savingsId,
                amount: 500,
                description: "Transfer in",
                date: new Date("2026-03-20T12:00:00.000Z"),
                category_id: null,
                merchant_id: null,
                in_budget: true,
                is_rebalance: true, // rebalance transaction — excluded by default
            },
        ],
    });
}

describe("ReportController (e2e)", () => {
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
        await prisma.recurringTransactionExecutions.deleteMany();
        await prisma.recurringTransactions.deleteMany();
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
        if (app) await app.close();
        await prisma?.$disconnect();
    });

    // ─── Authentication ───────────────────────────────────────────────

    test("requires authentication for all report routes", async () => {
        const routes = [
            "/report/kpis",
            "/report/cash-flow",
            "/report/cash-flow-sankey",
            "/report/by-category",
            "/report/category-trend",
            "/report/by-merchant",
            "/report/by-account",
            "/report/net-worth",
            "/report/budget-vs-actual",
        ];
        for (const route of routes) {
            // oxlint-disable-next-line no-await-in-loop
            const res = await agent.get(route).query({startDate: "2026-03-01", endDate: "2026-03-31"});
            expect(res.status).toBe(401);
        }
    });

    // ─── GET /report/kpis ─────────────────────────────────────────────

    test("kpis: returns income/expense/net/savingsRate/count with previous period", async () => {
        const u = await seedUser("kpis");
        await seedTransactions(u);

        const res = await agent
            .get("/report/kpis")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31T23:59:59.999Z"});

        expect(res.status).toBe(200);
        expect(res.body.current.income).toBe(2000);
        // -100 + -50 + -25 = -175 ; rebalance excluded
        expect(res.body.current.expense).toBe(175);
        expect(res.body.current.net).toBe(1825);
        expect(res.body.current.savingsRate).toBe(91.25);
        expect(res.body.current.transactionCount).toBe(4);

        // Previous window (equal length) → Feb 2026 has 1000 income / 110 expense
        expect(res.body.previous.income).toBe(1000);
        expect(res.body.previous.expense).toBe(110);
    });

    test("kpis: returns zeros when user has no accessible accounts", async () => {
        const u = await registerUser(server, {username: "kpis-empty"});
        const res = await agent
            .get("/report/kpis")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31"});
        expect(res.status).toBe(200);
        expect(res.body.current.income).toBe(0);
        expect(res.body.current.expense).toBe(0);
        expect(res.body.current.savingsRate).toBe(0);
        expect(res.body.current.transactionCount).toBe(0);
    });

    test("kpis: rejects invalid date range", async () => {
        const u = await registerUser(server, {username: "kpis-invalid"});
        const res = await agent
            .get("/report/kpis")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-04-01", endDate: "2026-03-01"});
        // Range order enforced in service
        expect(res.status).toBe(400);
    });

    // ─── GET /report/cash-flow ────────────────────────────────────────

    test("cash-flow: fills gaps and defaults to month resolution", async () => {
        const u = await seedUser("cashflow");
        await seedTransactions(u);

        const res = await agent
            .get("/report/cash-flow")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31T23:59:59.999Z"});

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].period).toBe("2026-03-01");
        expect(res.body[0].income).toBe(2000);
        expect(res.body[0].expense).toBe(175);
        expect(res.body[0].net).toBe(1825);
        expect(res.body[0].savingsRate).toBe(91.25);
        // Previous window is shifted by 1 bucket of the resolution (month), so
        // March compares against February, which carries the seeded 1000/110.
        expect(res.body[0].previousIncome).toBe(1000);
        expect(res.body[0].previousExpense).toBe(110);
        expect(res.body[0].previousNet).toBe(890);
        expect(res.body[0].previousSavingsRate).toBe(89);
    });

    test("cash-flow: honors day resolution", async () => {
        const u = await seedUser("cashflow-day");
        await seedTransactions(u);

        const res = await agent.get("/report/cash-flow").set("Authorization", `Bearer ${u.token}`).query({
            startDate: "2026-03-01",
            endDate: "2026-03-31T23:59:59.999Z",
            resolution: "day",
        });
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(31);
    });

    test("cash-flow: honors week / quarter / year resolutions", async () => {
        const u = await seedUser("cashflow-multi");
        await seedTransactions(u);

        for (const resolution of ["week", "quarter", "year"] as const) {
            // oxlint-disable-next-line no-await-in-loop
            const res = await agent.get("/report/cash-flow").set("Authorization", `Bearer ${u.token}`).query({
                startDate: "2026-01-01",
                endDate: "2026-12-31T23:59:59.999Z",
                resolution,
            });
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }
    });

    test("cash-flow: empty array when no accounts", async () => {
        const u = await registerUser(server, {username: "cashflow-empty"});
        const res = await agent
            .get("/report/cash-flow")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31"});
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    // ─── GET /report/cash-flow-sankey ─────────────────────────────────

    test("cash-flow-sankey: builds nodes and links with savings branch", async () => {
        const u = await seedUser("sankey");
        await seedTransactions(u);

        const res = await agent
            .get("/report/cash-flow-sankey")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31T23:59:59.999Z"});

        expect(res.status).toBe(200);
        expect(res.body.totals.income).toBe(2000);
        expect(res.body.totals.expense).toBe(175);
        expect(res.body.totals.net).toBe(1825);
        const hasRevenue = res.body.nodes.some((n: any) => n.id === "__revenue__");
        const hasSpending = res.body.nodes.some((n: any) => n.id === "__spending__");
        const hasSavings = res.body.nodes.some((n: any) => n.id === "__savings__");
        expect(hasRevenue).toBe(true);
        expect(hasSpending).toBe(true);
        expect(hasSavings).toBe(true);
    });

    test("cash-flow-sankey: creates deficit node when expenses > income", async () => {
        const u = await seedUser("sankey-deficit");
        // Only expenses in this window
        await prisma.transactions.create({
            data: {
                account_id: u.checkingId,
                amount: -300,
                description: "Deficit",
                date: new Date("2026-05-05T12:00:00.000Z"),
                category_id: u.groceriesId,
                in_budget: true,
                is_rebalance: false,
            },
        });
        // A little income (less than expense)
        await prisma.transactions.create({
            data: {
                account_id: u.checkingId,
                amount: 100,
                description: "Small income",
                date: new Date("2026-05-06T12:00:00.000Z"),
                category_id: u.salaryId,
                in_budget: true,
                is_rebalance: false,
            },
        });

        const res = await agent
            .get("/report/cash-flow-sankey")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-05-01", endDate: "2026-05-31"});
        expect(res.status).toBe(200);
        const hasDeficit = res.body.nodes.some((n: any) => n.id === "__deficit__");
        expect(hasDeficit).toBe(true);
        expect(res.body.totals.net).toBeLessThan(0);
    });

    test("cash-flow-sankey: returns empty structure when no data", async () => {
        const u = await seedUser("sankey-empty");
        const res = await agent
            .get("/report/cash-flow-sankey")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-06-01", endDate: "2026-06-30"});
        expect(res.status).toBe(200);
        expect(res.body.nodes).toEqual([]);
        expect(res.body.links).toEqual([]);
        expect(res.body.totals).toEqual({income: 0, expense: 0, net: 0});
    });

    // ─── GET /report/by-category ──────────────────────────────────────

    test("by-category: aggregates spending per category with uncategorized bucket", async () => {
        const u = await seedUser("bycat");
        await seedTransactions(u);

        const res = await agent
            .get("/report/by-category")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31T23:59:59.999Z", includeRebalances: "true"});

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const groceries = res.body.find((c: any) => c.categoryId === u.groceriesId);
        expect(groceries).toBeDefined();
        expect(groceries.spent).toBe(150);
        expect(groceries.count).toBe(2);
        expect(groceries.previousSpent).toBe(80);
        const uncategorized = res.body.find((c: any) => c.categoryId === null);
        // With includeRebalances=true and budgeted=all default, the uncategorized bucket
        // in March contains only the -25 (in_budget=false) since the rebalance is +500.
        expect(uncategorized).toBeDefined();
        expect(uncategorized.hexColor).toBe("#94a3b8");
    });

    test("by-category: budgeted=budgeted filter excludes in_budget=false rows", async () => {
        const u = await seedUser("bycat-budgeted");
        await seedTransactions(u);

        const res = await agent.get("/report/by-category").set("Authorization", `Bearer ${u.token}`).query({
            startDate: "2026-03-01",
            endDate: "2026-03-31T23:59:59.999Z",
            budgeted: "budgeted",
        });

        expect(res.status).toBe(200);
        // Uncategorized -25 is in_budget=false → excluded
        const uncategorized = res.body.find((c: any) => c.categoryId === null);
        expect(uncategorized).toBeUndefined();
    });

    test("by-category: budgeted=unbudgeted keeps only in_budget=false rows", async () => {
        const u = await seedUser("bycat-unbudgeted");
        await seedTransactions(u);

        const res = await agent.get("/report/by-category").set("Authorization", `Bearer ${u.token}`).query({
            startDate: "2026-03-01",
            endDate: "2026-03-31T23:59:59.999Z",
            budgeted: "unbudgeted",
        });

        expect(res.status).toBe(200);
        const groceries = res.body.find((c: any) => c.categoryId === u.groceriesId);
        expect(groceries).toBeUndefined();
    });

    // ─── GET /report/category-trend ───────────────────────────────────

    test("category-trend: returns categories with totals and period points", async () => {
        const u = await seedUser("trend");
        await seedTransactions(u);

        const res = await agent
            .get("/report/category-trend")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31T23:59:59.999Z"});

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.categories)).toBe(true);
        expect(Array.isArray(res.body.points)).toBe(true);
        const groceries = res.body.categories.find((c: any) => c.categoryId === u.groceriesId);
        expect(groceries).toBeDefined();
        expect(groceries.total).toBe(150);
    });

    test("category-trend: empty for user without accounts", async () => {
        const u = await registerUser(server, {username: "trend-empty"});
        const res = await agent
            .get("/report/category-trend")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31"});
        expect(res.status).toBe(200);
        expect(res.body.categories).toEqual([]);
        expect(res.body.points).toEqual([]);
    });

    // ─── GET /report/by-merchant ──────────────────────────────────────

    test("by-merchant: ranks merchants and applies limit", async () => {
        const u = await seedUser("merchant");
        await seedTransactions(u);

        const res = await agent
            .get("/report/by-merchant")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31T23:59:59.999Z", limit: 1});

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].merchantId).toBe(u.storeAId);
        expect(res.body[0].spent).toBe(100);
    });

    test("by-merchant: empty for user without accounts", async () => {
        const u = await registerUser(server, {username: "merch-empty"});
        const res = await agent
            .get("/report/by-merchant")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31"});
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    // ─── GET /report/by-account ───────────────────────────────────────

    test("by-account: aggregates income/expense per account with metadata", async () => {
        const u = await seedUser("byacc");
        await seedTransactions(u);

        const res = await agent
            .get("/report/by-account")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31T23:59:59.999Z"});

        expect(res.status).toBe(200);
        const checking = res.body.find((a: any) => a.accountId === u.checkingId);
        expect(checking).toBeDefined();
        expect(checking.income).toBe(2000);
        expect(checking.expense).toBe(175);
        expect(checking.type).toBe("CHECKING");
        expect(checking.access).toBe("owner");
    });

    // ─── GET /report/net-worth ────────────────────────────────────────

    test("net-worth: returns points aggregating balance per date and account type", async () => {
        const u = await seedUser("nw");
        await seedTransactions(u);

        const res = await agent
            .get("/report/net-worth")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31T23:59:59.999Z"});

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        const first = res.body[0];
        expect(typeof first.date).toBe("string");
        expect(typeof first.total).toBe("number");
        expect(first.byType).toBeDefined();
    });

    test("net-worth: day resolution stays granular", async () => {
        const u = await seedUser("nw-day");
        await seedTransactions(u);

        const res = await agent.get("/report/net-worth").set("Authorization", `Bearer ${u.token}`).query({
            startDate: "2026-03-01",
            endDate: "2026-03-31T23:59:59.999Z",
            resolution: "day",
        });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("net-worth: empty for user without accounts", async () => {
        const u = await registerUser(server, {username: "nw-empty"});
        const res = await agent
            .get("/report/net-worth")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31"});
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    // ─── GET /report/budget-vs-actual ─────────────────────────────────

    test("budget-vs-actual: emits point per month, honours budgets and actuals", async () => {
        const u = await seedUser("bva");
        await seedTransactions(u);

        // Create a budget for March 2026 tied to the checking account
        const budget = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${u.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 3000,
                categories: [{categoryId: u.groceriesId, amount: 500}],
                accountIds: [u.checkingId],
            });
        expect(budget.status).toBe(201);

        const res = await agent
            .get("/report/budget-vs-actual")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31T23:59:59.999Z"});

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        const march = res.body[0];
        expect(march.year).toBe(2026);
        expect(march.month).toBe(3);
        expect(march.budgetedIncome).toBe(3000);
        expect(march.budgetedExpense).toBe(500);
        expect(march.actualIncome).toBe(2000);
        // in_budget=true only → -100 + -50 = -150 → 150
        expect(march.actualExpense).toBe(150);
    });

    test("budget-vs-actual: empty for user without accounts", async () => {
        const u = await registerUser(server, {username: "bva-empty"});
        const res = await agent
            .get("/report/budget-vs-actual")
            .set("Authorization", `Bearer ${u.token}`)
            .query({startDate: "2026-03-01", endDate: "2026-03-31"});
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    // ─── Filters (broad coverage) ─────────────────────────────────────

    test("filters: accountIds, categoryIds, merchantIds narrow the scope", async () => {
        const u = await seedUser("filters");
        await seedTransactions(u);

        const byCat = await agent.get("/report/by-category").set("Authorization", `Bearer ${u.token}`).query({
            startDate: "2026-03-01",
            endDate: "2026-03-31T23:59:59.999Z",
            categoryIds: u.groceriesId,
            merchantIds: u.storeAId,
            accountIds: u.checkingId,
        });
        expect(byCat.status).toBe(200);
        const groceries = byCat.body.find((c: any) => c.categoryId === u.groceriesId);
        expect(groceries).toBeDefined();
        expect(groceries.spent).toBe(100);
    });

    test("filters: includeShared=false restricts to owned accounts only", async () => {
        const u = await seedUser("filters-owned");
        await seedTransactions(u);

        const res = await agent.get("/report/kpis").set("Authorization", `Bearer ${u.token}`).query({
            startDate: "2026-03-01",
            endDate: "2026-03-31T23:59:59.999Z",
            includeShared: "false",
        });
        expect(res.status).toBe(200);
        expect(res.body.current.income).toBe(2000);
    });
});
