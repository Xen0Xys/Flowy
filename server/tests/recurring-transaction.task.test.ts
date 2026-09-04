// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {afterAll, beforeAll, beforeEach, describe, expect, test} from "bun:test";
import {PrismaClient} from "../prisma/generated/client";
import {PrismaPg} from "@prisma/adapter-pg";
import {Test} from "@nestjs/testing";
import {AppModule} from "../src/app.module";
import {RecurringTransactionTask} from "../src/modules/accounting/recurring-transaction/recurring-transaction.task";
import {PrismaService} from "../src/modules/helper/prisma.service";
import argon2 from "argon2";
import crypto from "crypto";

let prisma: PrismaClient;
let task: RecurringTransactionTask;
let prismaService: PrismaService;
let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>["compile"]>>;

async function createUserRecord(): Promise<{id: string}> {
    const unique = crypto.randomUUID();
    const user = await prisma.users.create({
        data: {
            username: `task-${unique.slice(0, 8)}`,
            email: `task-${unique}@e2e.test`,
            password: await argon2.hash("password"),
            jwt_id: crypto.randomBytes(16).toString("hex"),
        },
    });
    return {id: user.id};
}

async function createAccountRecord(userId: string, balance = 1000): Promise<{id: string}> {
    const account = await prisma.accounts.create({
        data: {
            user_id: userId,
            name: "Task account",
            type: "CHECKING",
            balance,
        },
    });
    return {id: account.id};
}

async function createRecurring(
    userId: string,
    accountId: string,
    overrides: {
        amount?: number;
        nextRunAt?: Date;
        isEnabled?: boolean;
        lastFailureAt?: Date | null;
    } = {},
): Promise<{id: string}> {
    const rt = await prisma.recurringTransactions.create({
        data: {
            user_id: userId,
            account_id: accountId,
            name: "Loyer",
            amount: overrides.amount ?? -50,
            frequency: "MONTHLY",
            day_of_month: 5,
            day_of_week: null,
            timezone: "UTC",
            in_budget: true,
            is_enabled: overrides.isEnabled ?? true,
            next_run_at: overrides.nextRunAt ?? new Date(Date.now() - 60_000),
            last_failure_at: overrides.lastFailureAt ?? null,
        },
    });
    return {id: rt.id};
}

describe("RecurringTransactionTask", () => {
    beforeAll(async () => {
        prisma = new PrismaClient({
            adapter: new PrismaPg({
                connectionString: process.env.DATABASE_URL,
            }),
        });
        await prisma.$connect();

        moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        task = moduleRef.get(RecurringTransactionTask);
        prismaService = moduleRef.get(PrismaService);
    });

    beforeEach(async () => {
        await prisma.recurringTransactionExecutions.deleteMany();
        await prisma.recurringTransactions.deleteMany();
        await prisma.transactions.deleteMany();
        await prisma.accounts.deleteMany();
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
    });

    afterAll(async () => {
        await moduleRef?.close();
        await prisma?.$disconnect();
    });

    test("processes a due enabled recurring: creates transaction, updates balance, logs CREATED, advances next_run_at", async () => {
        const user = await createUserRecord();
        const account = await createAccountRecord(user.id, 1000);
        const originalNextRun = new Date(Date.now() - 60_000);
        const rt = await createRecurring(user.id, account.id, {amount: -75, nextRunAt: originalNextRun});

        const summary = await task.processDueRecurrences(new Date());

        expect(summary.processed).toBe(1);
        expect(summary.failed).toBe(0);

        const updatedAccount = await prisma.accounts.findUnique({where: {id: account.id}});
        expect(updatedAccount?.balance).toBe(925);

        const transactions = await prisma.transactions.findMany({where: {account_id: account.id}});
        expect(transactions).toHaveLength(1);
        expect(transactions[0].amount).toBe(-75);
        expect(transactions[0].description).toBe("Loyer");
        expect(transactions[0].is_rebalance).toBe(false);

        const executions = await prisma.recurringTransactionExecutions.findMany({
            where: {recurring_transaction_id: rt.id},
        });
        expect(executions).toHaveLength(1);
        expect(executions[0].status).toBe("CREATED");
        expect(executions[0].transaction_id).toBe(transactions[0].id);
        expect(executions[0].scheduled_for.getTime()).toBe(originalNextRun.getTime());

        const updatedRt = await prisma.recurringTransactions.findUnique({where: {id: rt.id}});
        expect(updatedRt?.next_run_at.getTime()).toBeGreaterThan(originalNextRun.getTime());
        expect(updatedRt?.last_run_at).not.toBeNull();
        expect(updatedRt?.last_failure_at).toBeNull();
    });

    test("processes a disabled recurring: logs SKIPPED without creating a transaction", async () => {
        const user = await createUserRecord();
        const account = await createAccountRecord(user.id, 200);
        const rt = await createRecurring(user.id, account.id, {isEnabled: false});

        const summary = await task.processDueRecurrences(new Date());

        expect(summary.processed).toBe(1);
        expect(summary.failed).toBe(0);

        const transactions = await prisma.transactions.findMany({where: {account_id: account.id}});
        expect(transactions).toHaveLength(0);

        const untouched = await prisma.accounts.findUnique({where: {id: account.id}});
        expect(untouched?.balance).toBe(200);

        const executions = await prisma.recurringTransactionExecutions.findMany({
            where: {recurring_transaction_id: rt.id},
        });
        expect(executions).toHaveLength(1);
        expect(executions[0].status).toBe("SKIPPED");
        expect(executions[0].transaction_id).toBeNull();
    });

    test("records FAILED execution when account belongs to another user", async () => {
        const owner = await createUserRecord();
        const other = await createUserRecord();
        const account = await createAccountRecord(other.id);

        const rt = await createRecurring(owner.id, account.id);

        const summary = await task.processDueRecurrences(new Date());

        expect(summary.processed).toBe(0);
        expect(summary.failed).toBe(1);

        const executions = await prisma.recurringTransactionExecutions.findMany({
            where: {recurring_transaction_id: rt.id},
        });
        expect(executions).toHaveLength(1);
        expect(executions[0].status).toBe("FAILED");
        expect(executions[0].error_message).toContain("ownership mismatch");

        const updatedRt = await prisma.recurringTransactions.findUnique({where: {id: rt.id}});
        expect(updatedRt?.last_failure_at).not.toBeNull();
        expect(updatedRt?.last_run_at).toBeNull();
    });

    test("deduplicates FAILED execution log within the failure dedup window", async () => {
        const owner = await createUserRecord();
        const other = await createUserRecord();
        const account = await createAccountRecord(other.id);
        const rt = await createRecurring(owner.id, account.id, {
            lastFailureAt: new Date(Date.now() - 60_000),
        });

        const summary = await task.processDueRecurrences(new Date());

        expect(summary.failed).toBe(1);

        const executions = await prisma.recurringTransactionExecutions.findMany({
            where: {recurring_transaction_id: rt.id},
        });
        expect(executions).toHaveLength(0);

        const updatedRt = await prisma.recurringTransactions.findUnique({where: {id: rt.id}});
        expect(updatedRt?.last_failure_at).not.toBeNull();
    });

    test("processAllDueUntilCaughtUp aggregates results across ticks until nothing is due", async () => {
        const user = await createUserRecord();
        const account = await createAccountRecord(user.id, 500);
        await createRecurring(user.id, account.id, {
            amount: -10,
            nextRunAt: new Date(Date.now() - 120_000),
        });

        const summary = await task.processAllDueUntilCaughtUp();
        expect(summary.processed).toBeGreaterThanOrEqual(1);
        expect(summary.failed).toBe(0);

        const stillDue = await prisma.recurringTransactions.findMany({
            where: {next_run_at: {lte: new Date()}},
        });
        expect(stillDue).toHaveLength(0);
    });

    test("mutex prevents concurrent runs: second concurrent runDue is a no-op", async () => {
        const user = await createUserRecord();
        const account = await createAccountRecord(user.id, 500);
        await createRecurring(user.id, account.id, {amount: -10});

        await Promise.all([task.runDue(), task.runDue()]);

        const executions = await prisma.recurringTransactionExecutions.findMany();
        expect(executions.length).toBeLessThanOrEqual(1);
    });

    test("does nothing when no recurring is due", async () => {
        const user = await createUserRecord();
        const account = await createAccountRecord(user.id);
        await createRecurring(user.id, account.id, {
            nextRunAt: new Date(Date.now() + 3600_000),
        });

        const summary = await task.processDueRecurrences(new Date());
        expect(summary.processed).toBe(0);
        expect(summary.failed).toBe(0);

        const executions = await prisma.recurringTransactionExecutions.findMany();
        expect(executions).toHaveLength(0);
    });

    test("uses prismaService directly (sanity check for DI)", async () => {
        expect(prismaService).toBeDefined();
        expect(typeof prismaService.$connect).toBe("function");
    });
});
