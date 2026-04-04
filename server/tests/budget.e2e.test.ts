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
        await prisma.budgetedCategories.deleteMany();
        await prisma.budgets.deleteMany();
        await prisma.userCategories.deleteMany();
        await prisma.userMerchants.deleteMany();
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
        expect(getResponse.body.message).toBe("Authorization token is missing");

        const spendingResponse = await agent.get("/budget/2026/3/spending");
        expect(spendingResponse.status).toBe(401);
        expect(spendingResponse.body.message).toBe("Authorization token is missing");

        const availableMonthsResponse = await agent.get("/budget/available-months");
        expect(availableMonthsResponse.status).toBe(401);
        expect(availableMonthsResponse.body.message).toBe("Authorization token is missing");

        const postResponse = await agent.post("/budget").send({
            month: 3,
            year: 2026,
            budgetedIncome: 100,
            categories: [],
        });
        expect(postResponse.status).toBe(401);
        expect(postResponse.body.message).toBe("Authorization token is missing");

        const putResponse = await agent.put("/budget/0195c8dd-c263-7569-99f6-9fc20aca3050").send({});
        expect(putResponse.status).toBe(401);
        expect(putResponse.body.message).toBe("Authorization token is missing");

        const deleteResponse = await agent.delete("/budget/0195c8dd-c263-7569-99f6-9fc20aca3050");
        expect(deleteResponse.status).toBe(401);
        expect(deleteResponse.body.message).toBe("Authorization token is missing");
    });

    test("rejects invalid token for all budget routes", async () => {
        const token = "Bearer invalid-token";

        const getResponse = await agent.get("/budget/2026/3").set("Authorization", token);
        expect(getResponse.status).toBe(401);
        expect(getResponse.body.message).toBe("Invalid or expired token");

        const spendingResponse = await agent.get("/budget/2026/3/spending").set("Authorization", token);
        expect(spendingResponse.status).toBe(401);
        expect(spendingResponse.body.message).toBe("Invalid or expired token");

        const availableMonthsResponse = await agent.get("/budget/available-months").set("Authorization", token);
        expect(availableMonthsResponse.status).toBe(401);
        expect(availableMonthsResponse.body.message).toBe("Invalid or expired token");

        const postResponse = await agent.post("/budget").set("Authorization", token).send({
            month: 3,
            year: 2026,
            budgetedIncome: 100,
            categories: [],
        });
        expect(postResponse.status).toBe(401);
        expect(postResponse.body.message).toBe("Invalid or expired token");

        const putResponse = await agent
            .put("/budget/0195c8dd-c263-7569-99f6-9fc20aca3050")
            .set("Authorization", token)
            .send({});
        expect(putResponse.status).toBe(401);
        expect(putResponse.body.message).toBe("Invalid or expired token");

        const deleteResponse = await agent
            .delete("/budget/0195c8dd-c263-7569-99f6-9fc20aca3050")
            .set("Authorization", token);
        expect(deleteResponse.status).toBe(401);
        expect(deleteResponse.body.message).toBe("Invalid or expired token");
    });

    // ─── GET /budget/:year/:month ─────────────────────────────────────

    test("returns 400 for invalid year param", async () => {
        const user = await registerUser(server);

        const response = await agent.get("/budget/not-a-number/3").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(400);
    });

    test("returns 400 for invalid month param", async () => {
        const user = await registerUser(server);

        const response = await agent.get("/budget/2026/not-a-number").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(400);
    });

    test("returns 400 for month out of range (0 and 13)", async () => {
        const user = await registerUser(server);

        const monthZero = await agent.get("/budget/2026/0").set("Authorization", `Bearer ${user.token}`);
        expect(monthZero.status).toBe(400);

        const monthThirteen = await agent.get("/budget/2026/13").set("Authorization", `Bearer ${user.token}`);
        expect(monthThirteen.status).toBe(400);
    });

    test("returns 400 for year out of range (0 and 10000)", async () => {
        const user = await registerUser(server);

        const yearZero = await agent.get("/budget/0/6").set("Authorization", `Bearer ${user.token}`);
        expect(yearZero.status).toBe(400);

        const yearTooHigh = await agent.get("/budget/10000/6").set("Authorization", `Bearer ${user.token}`);
        expect(yearTooHigh.status).toBe(400);
    });

    test("returns null when no budget exists for the period", async () => {
        const user = await registerUser(server);

        const response = await agent.get("/budget/2026/3").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(200);
        expect(response.body).toBeNull();
    });

    test("returns the budget for the requested period", async () => {
        const user = await registerUser(server);

        const budget = await prisma.budgets.create({
            data: {
                user_id: user.user.id,
                month: 3,
                year: 2026,
                budgeted_income: 3000,
            },
        });

        const response = await agent.get("/budget/2026/3").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(200);
        expect(response.body.id).toBe(budget.id);
        expect(response.body.month).toBe(3);
        expect(response.body.year).toBe(2026);
        expect(response.body.budgetedIncome).toBe(3000);
    });

    test("does not return another user's budget for the same period", async () => {
        const userA = await registerUser(server);
        const userB = await registerUser(server);

        await prisma.budgets.create({
            data: {
                user_id: userA.user.id,
                month: 5,
                year: 2026,
                budgeted_income: 5000,
            },
        });

        const response = await agent.get("/budget/2026/5").set("Authorization", `Bearer ${userB.token}`);
        expect(response.status).toBe(200);
        expect(response.body).toBeNull();
    });

    // ─── GET /budget/:year/:month/spending ───────────────────────────

    test("returns 400 for invalid params on spending route", async () => {
        const user = await registerUser(server);

        const invalidYear = await agent
            .get("/budget/not-a-number/3/spending")
            .set("Authorization", `Bearer ${user.token}`);
        expect(invalidYear.status).toBe(400);

        const invalidMonth = await agent
            .get("/budget/2026/not-a-number/spending")
            .set("Authorization", `Bearer ${user.token}`);
        expect(invalidMonth.status).toBe(400);

        const outOfRangeMonth = await agent.get("/budget/2026/13/spending").set("Authorization", `Bearer ${user.token}`);
        expect(outOfRangeMonth.status).toBe(400);
    });

    test("returns zero spending when user has no accounts", async () => {
        const user = await registerUser(server);

        const response = await agent.get("/budget/2026/3/spending").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            totalSpent: 0,
            actualIncome: 0,
            byCategory: [],
        });
    });

    test("returns aggregated spending and income by category for the requested month", async () => {
        const user = await registerUser(server);
        const otherUser = await registerUser(server);

        const account = await prisma.accounts.create({
            data: {
                user_id: user.user.id,
                type: "CHECKING",
                name: "Main account",
            },
        });

        const otherAccount = await prisma.accounts.create({
            data: {
                user_id: otherUser.user.id,
                type: "CHECKING",
                name: "Other account",
            },
        });

        const foodCategory = await prisma.userCategories.create({
            data: {
                user_id: user.user.id,
                name: "Food",
                hex_color: "#22C55E",
                icon: "utensils",
            },
        });

        await prisma.transactions.createMany({
            data: [
                {
                    account_id: account.id,
                    amount: -50,
                    description: "Groceries",
                    date: new Date("2026-03-10T10:00:00.000Z"),
                    category_id: foodCategory.id,
                },
                {
                    account_id: account.id,
                    amount: -20,
                    description: "Lunch",
                    date: new Date("2026-03-11T12:00:00.000Z"),
                    category_id: foodCategory.id,
                },
                {
                    account_id: account.id,
                    amount: -30,
                    description: "Cash withdraw",
                    date: new Date("2026-03-12T08:00:00.000Z"),
                    category_id: null,
                },
                {
                    account_id: account.id,
                    amount: 2000,
                    description: "Salary",
                    date: new Date("2026-03-02T08:00:00.000Z"),
                    category_id: null,
                },
                {
                    account_id: account.id,
                    amount: -999,
                    description: "Outside month",
                    date: new Date("2026-04-01T08:00:00.000Z"),
                    category_id: foodCategory.id,
                },
                {
                    account_id: otherAccount.id,
                    amount: -500,
                    description: "Other user expense",
                    date: new Date("2026-03-15T08:00:00.000Z"),
                    category_id: null,
                },
            ],
        });

        const response = await agent.get("/budget/2026/3/spending").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(200);
        expect(response.body.totalSpent).toBe(100);
        expect(response.body.actualIncome).toBe(2000);
        expect(response.body.byCategory).toHaveLength(2);

        expect(response.body.byCategory[0]).toEqual({
            categoryId: foodCategory.id,
            name: "Food",
            hexColor: "#22C55E",
            icon: "utensils",
            spent: 70,
        });

        expect(response.body.byCategory[1]).toEqual({
            categoryId: null,
            hexColor: "#94a3b8",
            icon: "iconoir:question-mark",
            spent: 30,
        });
    });

    // ─── GET /budget/available-months ────────────────────────────────

    test("returns an empty list of available months when user has no budgets", async () => {
        const user = await registerUser(server);

        const response = await agent.get("/budget/available-months").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    test("returns available months sorted descending and scoped to authenticated user", async () => {
        const user = await registerUser(server);
        const otherUser = await registerUser(server);

        await prisma.budgets.createMany({
            data: [
                {user_id: user.user.id, month: 3, year: 2026, budgeted_income: 3000},
                {user_id: user.user.id, month: 1, year: 2025, budgeted_income: 2000},
                {user_id: user.user.id, month: 12, year: 2026, budgeted_income: 3500},
                {user_id: otherUser.user.id, month: 7, year: 2030, budgeted_income: 9000},
            ],
        });

        const response = await agent.get("/budget/available-months").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual([
            {year: 2026, month: 12},
            {year: 2026, month: 3},
            {year: 2025, month: 1},
        ]);
    });

    // ─── POST /budget ─────────────────────────────────────────────────

    test("creates a budget with categories successfully", async () => {
        const user = await registerUser(server);

        const category = await prisma.userCategories.create({
            data: {
                user_id: user.user.id,
                name: "Food",
                hex_color: "#22C55E",
                icon: "utensils",
            },
        });

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 4,
                year: 2026,
                budgetedIncome: 4000,
                categories: [{categoryId: category.id, amount: 500}],
            });

        expect(response.status).toBe(201);
        expect(response.body.month).toBe(4);
        expect(response.body.year).toBe(2026);
        expect(response.body.budgetedIncome).toBe(4000);
        expect(response.body.userId).toBe(user.user.id);

        const storedBudget = await prisma.budgets.findUnique({
            where: {id: response.body.id},
            include: {budgeted_categories: true},
        });
        expect(storedBudget).not.toBeNull();
        expect(storedBudget!.budgeted_categories).toHaveLength(1);
        expect(storedBudget!.budgeted_categories[0].category_id).toBe(category.id);
        expect(storedBudget!.budgeted_categories[0].amount).toBe(500);
    });

    test("creates a budget with multiple categories", async () => {
        const user = await registerUser(server);

        const cat1 = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });
        const cat2 = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Transport", hex_color: "#3B82F6", icon: "car"},
        });

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 6,
                year: 2026,
                budgetedIncome: 3500,
                categories: [
                    {categoryId: cat1.id, amount: 400},
                    {categoryId: cat2.id, amount: 200},
                ],
            });

        expect(response.status).toBe(201);
        const stored = await prisma.budgetedCategories.findMany({
            where: {budget_id: response.body.id},
        });
        expect(stored).toHaveLength(2);
    });

    test("rejects creation with missing required fields", async () => {
        const user = await registerUser(server);

        const noMonth = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            year: 2026,
            budgetedIncome: 100,
            categories: [],
        });
        expect(noMonth.status).toBe(400);

        const noYear = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 3,
            budgetedIncome: 100,
            categories: [],
        });
        expect(noYear.status).toBe(400);

        const noIncome = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 3,
            year: 2026,
            categories: [],
        });
        expect(noIncome.status).toBe(400);

        const noCategories = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 3,
            year: 2026,
            budgetedIncome: 100,
        });
        expect(noCategories.status).toBe(400);
    });

    test("rejects creation with invalid month values", async () => {
        const user = await registerUser(server);

        const monthZero = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 0,
            year: 2026,
            budgetedIncome: 100,
            categories: [],
        });
        expect(monthZero.status).toBe(400);

        const monthThirteen = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 13,
            year: 2026,
            budgetedIncome: 100,
            categories: [],
        });
        expect(monthThirteen.status).toBe(400);

        const monthFloat = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 3.5,
            year: 2026,
            budgetedIncome: 100,
            categories: [],
        });
        expect(monthFloat.status).toBe(400);
    });

    test("rejects creation with invalid year values", async () => {
        const user = await registerUser(server);

        const yearZero = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 3,
            year: 0,
            budgetedIncome: 100,
            categories: [],
        });
        expect(yearZero.status).toBe(400);

        const yearTooHigh = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 3,
            year: 10000,
            budgetedIncome: 100,
            categories: [],
        });
        expect(yearTooHigh.status).toBe(400);
    });

    test("rejects creation with budgetedIncome below 0.01", async () => {
        const user = await registerUser(server);

        const zero = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 3,
            year: 2026,
            budgetedIncome: 0,
            categories: [],
        });
        expect(zero.status).toBe(400);

        const negative = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 3,
            year: 2026,
            budgetedIncome: -50,
            categories: [],
        });
        expect(negative.status).toBe(400);

        const tooSmall = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 3,
            year: 2026,
            budgetedIncome: 0.005,
            categories: [],
        });
        expect(tooSmall.status).toBe(400);
    });

    test("accepts budgetedIncome of exactly 0.01", async () => {
        const user = await registerUser(server);

        const category = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 0.01,
                categories: [{categoryId: category.id, amount: 0.01}],
            });
        expect(response.status).toBe(201);
    });

    test("rejects creation with empty categories array", async () => {
        const user = await registerUser(server);

        const response = await agent.post("/budget").set("Authorization", `Bearer ${user.token}`).send({
            month: 3,
            year: 2026,
            budgetedIncome: 100,
            categories: [],
        });
        expect(response.status).toBe(400);
    });

    test("rejects creation with invalid category amount", async () => {
        const user = await registerUser(server);

        const category = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });

        const zeroAmount = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [{categoryId: category.id, amount: 0}],
            });
        expect(zeroAmount.status).toBe(400);

        const negativeAmount = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [{categoryId: category.id, amount: -10}],
            });
        expect(negativeAmount.status).toBe(400);

        const tooSmallAmount = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [{categoryId: category.id, amount: 0.001}],
            });
        expect(tooSmallAmount.status).toBe(400);
    });

    test("accepts category amount of exactly 0.01", async () => {
        const user = await registerUser(server);

        const category = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [{categoryId: category.id, amount: 0.01}],
            });
        expect(response.status).toBe(201);
    });

    test("rejects creation with invalid categoryId UUID", async () => {
        const user = await registerUser(server);

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [{categoryId: "not-a-uuid", amount: 50}],
            });
        expect(response.status).toBe(400);
    });

    test("rejects creation with non-existent categoryId", async () => {
        const user = await registerUser(server);

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [{categoryId: "0195c8dd-c263-7569-99f6-9fc20aca3050", amount: 50}],
            });
        expect(response.status).toBe(400);
    });

    test("rejects creation with category owned by another user", async () => {
        const userA = await registerUser(server);
        const userB = await registerUser(server);

        const category = await prisma.userCategories.create({
            data: {user_id: userA.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });

        const response = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${userB.token}`)
            .send({
                month: 3,
                year: 2026,
                budgetedIncome: 100,
                categories: [{categoryId: category.id, amount: 50}],
            });
        expect(response.status).toBe(400);
    });

    test("rejects duplicate budget for same user, month, and year", async () => {
        const user = await registerUser(server);

        const category = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });

        const first = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 7,
                year: 2026,
                budgetedIncome: 2000,
                categories: [{categoryId: category.id, amount: 300}],
            });
        expect(first.status).toBe(201);

        const duplicate = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 7,
                year: 2026,
                budgetedIncome: 2500,
                categories: [{categoryId: category.id, amount: 400}],
            });
        expect(duplicate.status).toBe(409);
    });

    test("allows different users to have budgets for the same month/year", async () => {
        const userA = await registerUser(server);
        const userB = await registerUser(server);

        const catA = await prisma.userCategories.create({
            data: {user_id: userA.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });
        const catB = await prisma.userCategories.create({
            data: {user_id: userB.user.id, name: "Transport", hex_color: "#3B82F6", icon: "car"},
        });

        const responseA = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${userA.token}`)
            .send({
                month: 8,
                year: 2026,
                budgetedIncome: 3000,
                categories: [{categoryId: catA.id, amount: 500}],
            });
        expect(responseA.status).toBe(201);

        const responseB = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${userB.token}`)
            .send({
                month: 8,
                year: 2026,
                budgetedIncome: 4000,
                categories: [{categoryId: catB.id, amount: 600}],
            });
        expect(responseB.status).toBe(201);
    });

    // ─── PUT /budget/:budgetId ────────────────────────────────────────

    test("fully replaces budget fields and categories", async () => {
        const user = await registerUser(server);

        const oldCat = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Old", hex_color: "#FF0000", icon: "x"},
        });
        const newCat = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "New", hex_color: "#00FF00", icon: "check"},
        });

        const budget = await prisma.budgets.create({
            data: {
                user_id: user.user.id,
                month: 1,
                year: 2026,
                budgeted_income: 1000,
                budgeted_categories: {
                    create: {category_id: oldCat.id, amount: 100},
                },
            },
        });

        const response = await agent
            .put(`/budget/${budget.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                month: 2,
                year: 2026,
                budgetedIncome: 5000,
                categories: [{categoryId: newCat.id, amount: 800}],
            });

        expect(response.status).toBe(200);
        expect(response.body.month).toBe(2);
        expect(response.body.year).toBe(2026);
        expect(response.body.budgetedIncome).toBe(5000);

        const storedCategories = await prisma.budgetedCategories.findMany({
            where: {budget_id: budget.id},
        });
        expect(storedCategories).toHaveLength(1);
        expect(storedCategories[0].category_id).toBe(newCat.id);
        expect(storedCategories[0].amount).toBe(800);
    });

    test("partial update only changes provided fields", async () => {
        const user = await registerUser(server);

        await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });

        const budget = await prisma.budgets.create({
            data: {
                user_id: user.user.id,
                month: 3,
                year: 2026,
                budgeted_income: 2000,
            },
        });

        const response = await agent.put(`/budget/${budget.id}`).set("Authorization", `Bearer ${user.token}`).send({
            budgetedIncome: 3500,
        });

        expect(response.status).toBe(200);
        expect(response.body.month).toBe(3);
        expect(response.body.year).toBe(2026);
        expect(response.body.budgetedIncome).toBe(3500);
    });

    test("update with empty categories removes all budgeted categories", async () => {
        const user = await registerUser(server);

        const category = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });

        const budget = await prisma.budgets.create({
            data: {
                user_id: user.user.id,
                month: 4,
                year: 2026,
                budgeted_income: 2000,
                budgeted_categories: {
                    create: {category_id: category.id, amount: 300},
                },
            },
        });

        const response = await agent.put(`/budget/${budget.id}`).set("Authorization", `Bearer ${user.token}`).send({
            categories: [],
        });

        expect(response.status).toBe(200);

        const storedCategories = await prisma.budgetedCategories.findMany({
            where: {budget_id: budget.id},
        });
        expect(storedCategories).toHaveLength(0);
    });

    test("update with no categories field leaves existing categories untouched", async () => {
        const user = await registerUser(server);

        const category = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });

        const budget = await prisma.budgets.create({
            data: {
                user_id: user.user.id,
                month: 5,
                year: 2026,
                budgeted_income: 2000,
                budgeted_categories: {
                    create: {category_id: category.id, amount: 400},
                },
            },
        });

        const response = await agent.put(`/budget/${budget.id}`).set("Authorization", `Bearer ${user.token}`).send({
            budgetedIncome: 3000,
        });

        expect(response.status).toBe(200);

        const storedCategories = await prisma.budgetedCategories.findMany({
            where: {budget_id: budget.id},
        });
        expect(storedCategories).toHaveLength(1);
        expect(storedCategories[0].amount).toBe(400);
    });

    test("rejects update with invalid UUID param", async () => {
        const user = await registerUser(server);

        const response = await agent.put("/budget/not-a-uuid").set("Authorization", `Bearer ${user.token}`).send({
            budgetedIncome: 100,
        });
        expect(response.status).toBe(400);
    });

    test("rejects update for non-existent budget", async () => {
        const user = await registerUser(server);

        const response = await agent
            .put("/budget/0195c8dd-c263-7569-99f6-9fc20aca3050")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                budgetedIncome: 100,
            });
        expect(response.status).toBe(404);
    });

    test("forbids update on budget owned by another user", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const budget = await prisma.budgets.create({
            data: {
                user_id: owner.user.id,
                month: 6,
                year: 2026,
                budgeted_income: 1000,
            },
        });

        const response = await agent.put(`/budget/${budget.id}`).set("Authorization", `Bearer ${outsider.token}`).send({
            budgetedIncome: 9999,
        });
        expect(response.status).toBe(403);
    });

    test("rejects update with invalid category data", async () => {
        const user = await registerUser(server);

        const budget = await prisma.budgets.create({
            data: {
                user_id: user.user.id,
                month: 7,
                year: 2026,
                budgeted_income: 1000,
            },
        });

        const badCategoryId = await agent
            .put(`/budget/${budget.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                categories: [{categoryId: "not-a-uuid", amount: 50}],
            });
        expect(badCategoryId.status).toBe(400);

        const badAmount = await agent
            .put(`/budget/${budget.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                categories: [{categoryId: "0195c8dd-c263-7569-99f6-9fc20aca3050", amount: 0}],
            });
        expect(badAmount.status).toBe(400);

        const badIncome = await agent.put(`/budget/${budget.id}`).set("Authorization", `Bearer ${user.token}`).send({
            budgetedIncome: 0,
        });
        expect(badIncome.status).toBe(400);
    });

    test("returns 409 when update would collide with an existing period", async () => {
        const user = await registerUser(server);

        const firstBudget = await prisma.budgets.create({
            data: {
                user_id: user.user.id,
                month: 1,
                year: 2026,
                budgeted_income: 1000,
            },
        });

        await prisma.budgets.create({
            data: {
                user_id: user.user.id,
                month: 2,
                year: 2026,
                budgeted_income: 1500,
            },
        });

        const response = await agent
            .put(`/budget/${firstBudget.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({month: 2, year: 2026});

        expect(response.status).toBe(409);
    });

    // ─── DELETE /budget/:budgetId ─────────────────────────────────────

    test("deletes a budget and its categories successfully", async () => {
        const user = await registerUser(server);

        const category = await prisma.userCategories.create({
            data: {user_id: user.user.id, name: "Food", hex_color: "#22C55E", icon: "utensils"},
        });

        const budget = await prisma.budgets.create({
            data: {
                user_id: user.user.id,
                month: 9,
                year: 2026,
                budgeted_income: 2000,
                budgeted_categories: {
                    create: {category_id: category.id, amount: 300},
                },
            },
        });

        const response = await agent.delete(`/budget/${budget.id}`).set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(204);

        const deletedBudget = await prisma.budgets.findUnique({where: {id: budget.id}});
        expect(deletedBudget).toBeNull();

        const deletedCategories = await prisma.budgetedCategories.findMany({
            where: {budget_id: budget.id},
        });
        expect(deletedCategories).toHaveLength(0);
    });

    test("rejects delete with invalid UUID param", async () => {
        const user = await registerUser(server);

        const response = await agent.delete("/budget/not-a-uuid").set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(400);
    });

    test("rejects delete for non-existent budget", async () => {
        const user = await registerUser(server);

        const response = await agent
            .delete("/budget/0195c8dd-c263-7569-99f6-9fc20aca3050")
            .set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(404);
    });

    test("forbids delete on budget owned by another user", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const budget = await prisma.budgets.create({
            data: {
                user_id: owner.user.id,
                month: 10,
                year: 2026,
                budgeted_income: 1000,
            },
        });

        const response = await agent.delete(`/budget/${budget.id}`).set("Authorization", `Bearer ${outsider.token}`);
        expect(response.status).toBe(403);
    });
});
