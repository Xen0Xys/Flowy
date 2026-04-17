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

describe("TransferController (e2e)", () => {
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

    test("requires authentication for transfer routes", async () => {
        const create = await agent.post("/transfer").send({
            debitAccountId: "0195c8dd-c263-7569-99f6-9fc20aca3050",
            creditAccountId: "0195c8dd-c263-7569-99f6-9fc20aca3051",
            amount: 10,
            description: "Transfer",
            date: "2026-01-15T12:00:00.000Z",
        });
        expect(create.status).toBe(401);
        expect(create.body.message).toBe("Authorization token is missing");

        const unlink = await agent.delete("/transfer/unlink/0195c8dd-c263-7569-99f6-9fc20aca3052");
        expect(unlink.status).toBe(401);
        expect(unlink.body.message).toBe("Authorization token is missing");

        const link = await agent.post(
            "/transfer/link/0195c8dd-c263-7569-99f6-9fc20aca3050/0195c8dd-c263-7569-99f6-9fc20aca3051",
        );
        expect(link.status).toBe(401);
        expect(link.body.message).toBe("Authorization token is missing");
    });

    test("creates a transfer, links transactions and updates balances", async () => {
        const user = await registerUser(server);

        const debitAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Checking", type: "CHECKING", balance: 500});
        const creditAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Savings", type: "SAVINGS", balance: 50});

        const response = await agent.post("/transfer").set("Authorization", `Bearer ${user.token}`).send({
            debitAccountId: debitAccount.body.id,
            creditAccountId: creditAccount.body.id,
            amount: 125.35,
            description: "Monthly move",
            date: "2026-01-20T09:00:00.000Z",
        });

        expect(response.status).toBe(201);
        expect(response.body).toHaveLength(2);
        const negative = response.body.find((tx: {amount: number}) => tx.amount < 0);
        const positive = response.body.find((tx: {amount: number}) => tx.amount > 0);
        expect(negative?.amount).toBe(-125.35);
        expect(positive?.amount).toBe(125.35);
        expect(negative?.linkedTransactionId).toBe(positive?.id);
        expect(positive?.linkedTransactionId).toBe(negative?.id);

        const debitStored = await prisma.accounts.findUnique({where: {id: debitAccount.body.id}});
        const creditStored = await prisma.accounts.findUnique({where: {id: creditAccount.body.id}});
        expect(debitStored?.balance).toBe(374.65);
        expect(creditStored?.balance).toBe(175.35);

        const transferCount = await prisma.transfers.count();
        expect(transferCount).toBe(1);
    });

    test("links two existing opposite transactions", async () => {
        const user = await registerUser(server);

        const debitAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Main", type: "CHECKING"});
        const creditAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Reserve", type: "SAVINGS"});

        expect(debitAccount.status).toBe(201);
        expect(creditAccount.status).toBe(201);

        const debitTransaction = await prisma.transactions.create({
            data: {
                account_id: debitAccount.body.id,
                amount: -40,
                description: "Manual transfer out",
                date: new Date("2026-01-21T10:00:00.000Z"),
            },
        });
        const creditTransaction = await prisma.transactions.create({
            data: {
                account_id: creditAccount.body.id,
                amount: 40,
                description: "Manual transfer in",
                date: new Date("2026-01-21T10:00:00.000Z"),
            },
        });

        const response = await agent
            .post(`/transfer/link/${debitTransaction.id}/${creditTransaction.id}`)
            .set("Authorization", `Bearer ${user.token}`);

        expect(response.status).toBe(201);
        expect(response.body).toHaveLength(2);
        const transferCount = await prisma.transfers.count();
        expect(transferCount).toBe(1);
    });

    test("unlinks a linked transfer", async () => {
        const user = await registerUser(server);

        const debitAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Wallet", type: "CHECKING", balance: 200});
        const creditAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Emergency", type: "SAVINGS", balance: 100});

        const created = await agent.post("/transfer").set("Authorization", `Bearer ${user.token}`).send({
            debitAccountId: debitAccount.body.id,
            creditAccountId: creditAccount.body.id,
            amount: 30,
            description: "Split",
            date: "2026-01-22T12:00:00.000Z",
        });

        const firstTransactionId = created.body[0].id;
        const unlink = await agent
            .delete(`/transfer/unlink/${firstTransactionId}`)
            .set("Authorization", `Bearer ${user.token}`);

        expect(unlink.status).toBe(200);
        expect(unlink.body).toHaveLength(2);

        const transferCount = await prisma.transfers.count();
        expect(transferCount).toBe(0);
    });

    test("rejects linking transactions with different absolute amounts", async () => {
        const user = await registerUser(server);

        const accountA = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Account A", type: "CHECKING"});
        const accountB = await agent
            .post("/account")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Account B", type: "SAVINGS"});

        expect(accountA.status).toBe(201);
        expect(accountB.status).toBe(201);

        const tx1 = await prisma.transactions.create({
            data: {
                account_id: accountA.body.id,
                amount: -25,
                description: "Out",
                date: new Date("2026-01-22T10:00:00.000Z"),
            },
        });
        const tx2 = await prisma.transactions.create({
            data: {
                account_id: accountB.body.id,
                amount: 20,
                description: "In",
                date: new Date("2026-01-22T10:00:00.000Z"),
            },
        });

        const response = await agent
            .post(`/transfer/link/${tx1.id}/${tx2.id}`)
            .set("Authorization", `Bearer ${user.token}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Transfer transactions must have the same absolute amount");
    });

    test("forbids cross-user transfer operations", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const ownerAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Owner", type: "CHECKING"});
        const outsiderAccount = await agent
            .post("/account")
            .set("Authorization", `Bearer ${outsider.token}`)
            .send({name: "Outsider", type: "SAVINGS"});

        const create = await agent.post("/transfer").set("Authorization", `Bearer ${outsider.token}`).send({
            debitAccountId: ownerAccount.body.id,
            creditAccountId: outsiderAccount.body.id,
            amount: 15,
            description: "Not allowed",
            date: "2026-01-23T12:00:00.000Z",
        });

        expect(create.status).toBe(403);
        expect(create.body.message).toBe("You do not have permission to access this account");
    });

    test("forbids linking and unlinking transfers using another user's transactions", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const ownerDebit = await agent
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Owner debit", type: "CHECKING"});
        const ownerCredit = await agent
            .post("/account")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Owner credit", type: "SAVINGS"});

        expect(ownerDebit.status).toBe(201);
        expect(ownerCredit.status).toBe(201);

        const ownerCreateTransfer = await agent.post("/transfer").set("Authorization", `Bearer ${owner.token}`).send({
            debitAccountId: ownerDebit.body.id,
            creditAccountId: ownerCredit.body.id,
            amount: 22,
            description: "Owner transfer",
            date: "2026-06-01T10:00:00.000Z",
        });
        expect(ownerCreateTransfer.status).toBe(201);

        const ownerExistingTransferTxId = ownerCreateTransfer.body[0].id as string;

        const outsiderDebit = await agent
            .post("/account")
            .set("Authorization", `Bearer ${outsider.token}`)
            .send({name: "Outsider debit", type: "CHECKING"});
        const outsiderCredit = await agent
            .post("/account")
            .set("Authorization", `Bearer ${outsider.token}`)
            .send({name: "Outsider credit", type: "SAVINGS"});

        expect(outsiderDebit.status).toBe(201);
        expect(outsiderCredit.status).toBe(201);

        const outsiderTx1 = await prisma.transactions.create({
            data: {
                account_id: outsiderDebit.body.id,
                amount: -11,
                description: "Outsider tx 1",
                date: new Date("2026-06-02T10:00:00.000Z"),
            },
        });
        const outsiderTx2 = await prisma.transactions.create({
            data: {
                account_id: outsiderCredit.body.id,
                amount: 11,
                description: "Outsider tx 2",
                date: new Date("2026-06-02T10:00:00.000Z"),
            },
        });

        const outsiderLinkOwnerData = await agent
            .post(`/transfer/link/${ownerExistingTransferTxId}/${outsiderTx1.id}`)
            .set("Authorization", `Bearer ${outsider.token}`);
        expect(outsiderLinkOwnerData.status).toBe(403);

        const outsiderUnlinkOwnerTransfer = await agent
            .delete(`/transfer/unlink/${ownerExistingTransferTxId}`)
            .set("Authorization", `Bearer ${outsider.token}`);
        expect(outsiderUnlinkOwnerTransfer.status).toBe(403);

        const ownerLinkOutsiderData = await agent
            .post(`/transfer/link/${outsiderTx1.id}/${outsiderTx2.id}`)
            .set("Authorization", `Bearer ${owner.token}`);
        expect(ownerLinkOutsiderData.status).toBe(403);
    });

    test("rejects invalid UUID route params on link and unlink", async () => {
        const user = await registerUser(server);

        const unlink = await agent.delete("/transfer/unlink/not-a-uuid").set("Authorization", `Bearer ${user.token}`);
        expect(unlink.status).toBe(400);

        const link = await agent.post("/transfer/link/not-a-uuid/also-bad").set("Authorization", `Bearer ${user.token}`);
        expect(link.status).toBe(400);
    });
});
