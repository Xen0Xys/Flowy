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

async function createAccount(token: string, name = "Main", balance = 500): Promise<string> {
    const res = await agent
        .post("/account")
        .set("Authorization", `Bearer ${token}`)
        .send({name, type: "CHECKING", balance});
    expect(res.status).toBe(201);
    return res.body.id;
}

async function createCategory(userId: string, name = "Bills"): Promise<string> {
    const cat = await prisma.userCategories.create({
        data: {user_id: userId, name, hex_color: "#3B82F6", icon: "file-invoice"},
    });
    return cat.id;
}

async function createMerchant(userId: string, name = "Netflix"): Promise<string> {
    const merchant = await prisma.userMerchants.create({
        data: {user_id: userId, name},
    });
    return merchant.id;
}

function baseCreatePayload(overrides: Record<string, unknown> = {}) {
    return {
        name: "Loyer",
        amount: -800,
        frequency: "MONTHLY",
        dayOfMonth: 5,
        timezone: "Europe/Paris",
        inBudget: true,
        ...overrides,
    };
}

describe("RecurringTransactionController (e2e)", () => {
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
        await prisma.recurringTransactionExecutions.deleteMany();
        await prisma.recurringTransactions.deleteMany();
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

    test("requires authentication on every route", async () => {
        const fakeId = "0195c8dd-c263-7569-99f6-9fc20aca3050";

        const list = await agent.get("/recurring-transaction");
        expect(list.status).toBe(401);

        const calendar = await agent.get("/recurring-transaction/calendar?year=2026&month=3");
        expect(calendar.status).toBe(401);

        const byId = await agent.get(`/recurring-transaction/${fakeId}`);
        expect(byId.status).toBe(401);

        const executions = await agent.get(`/recurring-transaction/${fakeId}/executions?page=1&pageSize=10`);
        expect(executions.status).toBe(401);

        const create = await agent.post(`/recurring-transaction/account/${fakeId}`).send(baseCreatePayload());
        expect(create.status).toBe(401);

        const update = await agent.patch(`/recurring-transaction/${fakeId}`).send({name: "X"});
        expect(update.status).toBe(401);

        const toggle = await agent.patch(`/recurring-transaction/${fakeId}/toggle`).send({isEnabled: false});
        expect(toggle.status).toBe(401);

        const remove = await agent.delete(`/recurring-transaction/${fakeId}`);
        expect(remove.status).toBe(401);
    });

    test("creates a MONTHLY recurring transaction with merchant and category", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);
        const categoryId = await createCategory(user.user.id);
        const merchantId = await createMerchant(user.user.id);

        const res = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload({merchantId, categoryId, isEnabled: true}));

        expect(res.status).toBe(201);
        expect(res.body.userId).toBe(user.user.id);
        expect(res.body.accountId).toBe(accountId);
        expect(res.body.name).toBe("Loyer");
        expect(res.body.amount).toBe(-800);
        expect(res.body.frequency).toBe("MONTHLY");
        expect(res.body.dayOfMonth).toBe(5);
        expect(res.body.timezone).toBe("Europe/Paris");
        expect(res.body.inBudget).toBe(true);
        expect(res.body.isEnabled).toBe(true);
        expect(res.body.isFailing).toBe(false);
        expect(res.body.merchant.id).toBe(merchantId);
        expect(res.body.category.id).toBe(categoryId);
        expect(new Date(res.body.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    });

    test("creates a WEEKLY recurring transaction", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);

        const res = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(
                baseCreatePayload({
                    name: "Abonnement",
                    amount: -12.5,
                    frequency: "WEEKLY",
                    dayOfMonth: undefined,
                    dayOfWeek: 1,
                }),
            );

        expect(res.status).toBe(201);
        expect(res.body.frequency).toBe("WEEKLY");
        expect(res.body.dayOfWeek).toBe(1);
        expect(res.body.dayOfMonth).toBeNull();
    });

    test("rejects create when frequency/day combination is invalid", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);

        const missingDayOfWeek = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(
                baseCreatePayload({
                    frequency: "WEEKLY",
                    dayOfMonth: undefined,
                }),
            );
        expect(missingDayOfWeek.status).toBe(400);

        const missingDayOfMonth = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(
                baseCreatePayload({
                    frequency: "MONTHLY",
                    dayOfMonth: undefined,
                }),
            );
        expect(missingDayOfMonth.status).toBe(400);
    });

    test("rejects create with invalid timezone", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);

        const res = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload({timezone: "Mars/Olympus_Mons"}));

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid timezone: Mars/Olympus_Mons");
    });

    test("rejects create when account belongs to another user", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);
        const accountId = await createAccount(owner.token);

        const res = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${outsider.token}`)
            .send(baseCreatePayload());

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("You do not have permission to access this account");
    });

    test("rejects create when account does not exist", async () => {
        const user = await registerUser(server);
        const fakeAccountId = "0195c8dd-c263-7569-99f6-9fc20aca3050";

        const res = await agent
            .post(`/recurring-transaction/account/${fakeAccountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload());

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Account not found");
    });

    test("rejects create when merchant or category does not belong to user", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);
        const outsiderAccount = await createAccount(outsider.token);
        const ownerMerchantId = await createMerchant(owner.user.id);
        const ownerCategoryId = await createCategory(owner.user.id);

        const badMerchant = await agent
            .post(`/recurring-transaction/account/${outsiderAccount}`)
            .set("Authorization", `Bearer ${outsider.token}`)
            .send(baseCreatePayload({merchantId: ownerMerchantId}));
        expect(badMerchant.status).toBe(404);
        expect(badMerchant.body.message).toBe("Merchant not found");

        const badCategory = await agent
            .post(`/recurring-transaction/account/${outsiderAccount}`)
            .set("Authorization", `Bearer ${outsider.token}`)
            .send(baseCreatePayload({categoryId: ownerCategoryId}));
        expect(badCategory.status).toBe(404);
        expect(badCategory.body.message).toBe("Category not found");
    });

    test("rejects create with invalid payload shape", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);

        const res = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "",
                amount: 0,
                frequency: "INVALID",
                timezone: "",
                inBudget: "yes",
            });

        expect(res.status).toBe(400);
        expect(Array.isArray(res.body.message)).toBe(true);
        expect(res.body.message).toEqual(
            expect.arrayContaining([
                expect.objectContaining({property: "name"}),
                expect.objectContaining({property: "amount"}),
                expect.objectContaining({property: "frequency"}),
                expect.objectContaining({property: "timezone"}),
            ]),
        );
    });

    test("lists recurring transactions with account and enabled filters", async () => {
        const user = await registerUser(server);
        const other = await registerUser(server);
        const account1 = await createAccount(user.token, "First");
        const account2 = await createAccount(user.token, "Second");
        const outsiderAccount = await createAccount(other.token, "Outsider");

        const create1 = await agent
            .post(`/recurring-transaction/account/${account1}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload({name: "R1"}));
        expect(create1.status).toBe(201);

        const create2 = await agent
            .post(`/recurring-transaction/account/${account2}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload({name: "R2"}));
        expect(create2.status).toBe(201);

        await agent
            .post(`/recurring-transaction/account/${outsiderAccount}`)
            .set("Authorization", `Bearer ${other.token}`)
            .send(baseCreatePayload({name: "OtherR"}));

        await agent
            .patch(`/recurring-transaction/${create2.body.id}/toggle`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({isEnabled: false});

        const all = await agent.get("/recurring-transaction").set("Authorization", `Bearer ${user.token}`);
        expect(all.status).toBe(200);
        expect(all.body).toHaveLength(2);
        expect(all.body.every((rt: {userId: string}) => rt.userId === user.user.id)).toBe(true);

        const filteredAccount = await agent
            .get(`/recurring-transaction?accountId=${account1}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(filteredAccount.status).toBe(200);
        expect(filteredAccount.body).toHaveLength(1);
        expect(filteredAccount.body[0].accountId).toBe(account1);

        const enabledOnly = await agent
            .get("/recurring-transaction?enabled=true")
            .set("Authorization", `Bearer ${user.token}`);
        expect(enabledOnly.status).toBe(200);
        expect(enabledOnly.body).toHaveLength(1);
        expect(enabledOnly.body[0].isEnabled).toBe(true);

        const disabledOnly = await agent
            .get("/recurring-transaction?enabled=false")
            .set("Authorization", `Bearer ${user.token}`);
        expect(disabledOnly.status).toBe(200);
        expect(disabledOnly.body).toHaveLength(1);
        expect(disabledOnly.body[0].isEnabled).toBe(false);
    });

    test("gets a recurring transaction by id and rejects foreign access", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);
        const accountId = await createAccount(owner.token);

        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        const mine = await agent
            .get(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${owner.token}`);
        expect(mine.status).toBe(200);
        expect(mine.body.id).toBe(created.body.id);

        const forbidden = await agent
            .get(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${outsider.token}`);
        expect(forbidden.status).toBe(403);
        expect(forbidden.body.message).toBe("You do not have permission to access this recurring transaction");
    });

    test("returns 404 for missing recurring transaction", async () => {
        const user = await registerUser(server);
        const missingId = "0195c8dd-c263-7569-99f6-9fc20aca3060";

        const byId = await agent.get(`/recurring-transaction/${missingId}`).set("Authorization", `Bearer ${user.token}`);
        expect(byId.status).toBe(404);
        expect(byId.body.message).toBe("Recurring transaction not found");

        const update = await agent
            .patch(`/recurring-transaction/${missingId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "X"});
        expect(update.status).toBe(404);

        const toggle = await agent
            .patch(`/recurring-transaction/${missingId}/toggle`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({isEnabled: false});
        expect(toggle.status).toBe(404);

        const remove = await agent
            .delete(`/recurring-transaction/${missingId}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(remove.status).toBe(404);
    });

    test("updates recurring transaction fields and reschedules when timing changes", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);
        const merchantId = await createMerchant(user.user.id, "Original");
        const categoryId = await createCategory(user.user.id, "Original");

        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload({merchantId, categoryId}));
        expect(created.status).toBe(201);

        await prisma.recurringTransactions.update({
            where: {id: created.body.id},
            data: {last_failure_at: new Date()},
        });

        const previousNextRun = new Date(created.body.nextRunAt).getTime();

        const newMerchantId = await createMerchant(user.user.id, "Updated");
        const newCategoryId = await createCategory(user.user.id, "Updated");

        const update = await agent
            .patch(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "Loyer v2",
                amount: -900.5,
                merchantId: newMerchantId,
                categoryId: newCategoryId,
                frequency: "QUARTERLY",
                dayOfMonth: 10,
                monthOfYear: 2,
                timezone: "UTC",
                inBudget: false,
                isEnabled: true,
            });

        expect(update.status).toBe(200);
        expect(update.body.name).toBe("Loyer v2");
        expect(update.body.amount).toBe(-900.5);
        expect(update.body.merchant.id).toBe(newMerchantId);
        expect(update.body.category.id).toBe(newCategoryId);
        expect(update.body.frequency).toBe("QUARTERLY");
        expect(update.body.dayOfMonth).toBe(10);
        expect(update.body.monthOfYear).toBe(2);
        expect(update.body.timezone).toBe("UTC");
        expect(update.body.inBudget).toBe(false);
        expect(update.body.lastFailureAt).toBeNull();
        expect(new Date(update.body.nextRunAt).getTime()).not.toBe(previousNextRun);
    });

    test("update validates references and timezone", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);
        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        const badTz = await agent
            .patch(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({timezone: "Not/A_Zone"});
        expect(badTz.status).toBe(400);
        expect(badTz.body.message).toBe("Invalid timezone: Not/A_Zone");

        const badWeekly = await agent
            .patch(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({frequency: "WEEKLY"});
        expect(badWeekly.status).toBe(400);

        const other = await registerUser(server);
        const otherMerchantId = await createMerchant(other.user.id, "Not mine");
        const badMerchant = await agent
            .patch(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({merchantId: otherMerchantId});
        expect(badMerchant.status).toBe(404);
        expect(badMerchant.body.message).toBe("Merchant not found");
    });

    test("update rejects when requester is not the owner", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);
        const accountId = await createAccount(owner.token);

        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        const res = await agent
            .patch(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${outsider.token}`)
            .send({name: "Hacked"});
        expect(res.status).toBe(403);
    });

    test("toggle enables and disables a recurring transaction", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);
        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        const disable = await agent
            .patch(`/recurring-transaction/${created.body.id}/toggle`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({isEnabled: false});
        expect(disable.status).toBe(200);
        expect(disable.body.isEnabled).toBe(false);

        const enable = await agent
            .patch(`/recurring-transaction/${created.body.id}/toggle`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({isEnabled: true});
        expect(enable.status).toBe(200);
        expect(enable.body.isEnabled).toBe(true);
    });

    test("delete removes recurring transaction and cascade removes executions", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);
        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        await prisma.recurringTransactionExecutions.create({
            data: {
                recurring_transaction_id: created.body.id,
                status: "SKIPPED",
                scheduled_for: new Date(),
            },
        });

        const res = await agent
            .delete(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(res.status).toBe(204);

        const deletedExecs = await prisma.recurringTransactionExecutions.findMany({
            where: {recurring_transaction_id: created.body.id},
        });
        expect(deletedExecs).toHaveLength(0);
    });

    test("delete rejects when requester is not the owner", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);
        const accountId = await createAccount(owner.token);
        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        const res = await agent
            .delete(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${outsider.token}`);
        expect(res.status).toBe(403);
    });

    test("lists executions with pagination", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);
        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        const base = Date.UTC(2026, 0, 1, 6, 0, 0);
        for (let i = 0; i < 15; i++) {
            // oxlint-disable-next-line no-await-in-loop
            await prisma.recurringTransactionExecutions.create({
                data: {
                    recurring_transaction_id: created.body.id,
                    status: "CREATED",
                    scheduled_for: new Date(base + i * 86400_000),
                },
            });
        }

        const page1 = await agent
            .get(`/recurring-transaction/${created.body.id}/executions?page=1&pageSize=10`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(page1.status).toBe(200);
        expect(page1.body.total).toBe(15);
        expect(page1.body.totalPages).toBe(2);
        expect(page1.body.page).toBe(1);
        expect(page1.body.pageSize).toBe(10);
        expect(page1.body.items).toHaveLength(10);

        const page2 = await agent
            .get(`/recurring-transaction/${created.body.id}/executions?page=2&pageSize=10`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(page2.status).toBe(200);
        expect(page2.body.items).toHaveLength(5);
    });

    test("executions rejects foreign access", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);
        const accountId = await createAccount(owner.token);
        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        const res = await agent
            .get(`/recurring-transaction/${created.body.id}/executions?page=1&pageSize=10`)
            .set("Authorization", `Bearer ${outsider.token}`);
        expect(res.status).toBe(403);
    });

    test("returns calendar occurrences for the given month", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);
        const monthlyCreate = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload({dayOfMonth: 15}));
        expect(monthlyCreate.status).toBe(201);

        const weeklyCreate = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(
                baseCreatePayload({
                    name: "Weekly",
                    frequency: "WEEKLY",
                    dayOfMonth: undefined,
                    dayOfWeek: 1,
                }),
            );
        expect(weeklyCreate.status).toBe(201);

        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth() + 1;

        const res = await agent
            .get(`/recurring-transaction/calendar?year=${year}&month=${month}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body.year).toBe(year);
        expect(res.body.month).toBe(month);
        expect(res.body.recurringTransactions).toHaveLength(2);
        expect(Array.isArray(res.body.occurrences)).toBe(true);
        expect(res.body.occurrences.length).toBeGreaterThan(0);
        for (const occ of res.body.occurrences) {
            expect(typeof occ.localDate).toBe("string");
            expect(occ.recurringTransactionId).toBeDefined();
        }
    });

    test("calendar rejects invalid query params", async () => {
        const user = await registerUser(server);
        const missingMonth = await agent
            .get("/recurring-transaction/calendar?year=2026")
            .set("Authorization", `Bearer ${user.token}`);
        expect(missingMonth.status).toBe(400);

        const badMonth = await agent
            .get("/recurring-transaction/calendar?year=2026&month=13")
            .set("Authorization", `Bearer ${user.token}`);
        expect(badMonth.status).toBe(400);
    });

    test("isFailing flag is true when the latest attempt failed and no success happened since", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);
        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        // Failure recorded a long time ago, no successful run since.
        await prisma.recurringTransactions.update({
            where: {id: created.body.id},
            data: {
                last_failure_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                last_run_at: null,
            },
        });

        const res = await agent
            .get(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body.isFailing).toBe(true);
    });

    test("isFailing flag is false when a successful run happened after the last failure", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);
        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        const failureAt = new Date(Date.now() - 60 * 60 * 1000);
        const runAt = new Date(Date.now() - 30 * 60 * 1000);
        await prisma.recurringTransactions.update({
            where: {id: created.body.id},
            data: {last_failure_at: failureAt, last_run_at: runAt},
        });

        const res = await agent
            .get(`/recurring-transaction/${created.body.id}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body.isFailing).toBe(false);
    });

    test("toggle rejects payloads missing isEnabled", async () => {
        const user = await registerUser(server);
        const accountId = await createAccount(user.token);
        const created = await agent
            .post(`/recurring-transaction/account/${accountId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload());
        expect(created.status).toBe(201);

        const missingField = await agent
            .patch(`/recurring-transaction/${created.body.id}/toggle`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({});
        expect(missingField.status).toBe(400);

        const nullValue = await agent
            .patch(`/recurring-transaction/${created.body.id}/toggle`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({isEnabled: null});
        expect(nullValue.status).toBe(400);
    });

    test("list rejects unsupported enabled filter values", async () => {
        const user = await registerUser(server);

        const invalid = await agent.get("/recurring-transaction?enabled=1").set("Authorization", `Bearer ${user.token}`);
        expect(invalid.status).toBe(400);
    });

    test("rejects invalid UUID params", async () => {
        const user = await registerUser(server);

        const badId = await agent.get("/recurring-transaction/not-a-uuid").set("Authorization", `Bearer ${user.token}`);
        expect(badId.status).toBe(400);

        const badAccountId = await agent
            .post("/recurring-transaction/account/not-a-uuid")
            .set("Authorization", `Bearer ${user.token}`)
            .send(baseCreatePayload());
        expect(badAccountId.status).toBe(400);
    });
});
