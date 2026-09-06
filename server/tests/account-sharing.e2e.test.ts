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
import {createCsrfAgent, ensureInstanceConfig, registerUser, RegisteredUser} from "./test-utils";

let app: NestFastifyApplication;
let server: Server;
let prisma: PrismaClient;
let agent: ReturnType<typeof request.agent>;

async function createAccount(userToken: string, name = "Main", balance = 0): Promise<{id: string}> {
    const res = await agent
        .post("/account")
        .set("Authorization", `Bearer ${userToken}`)
        .send({name, type: "CHECKING", balance});
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

async function setupFamily(): Promise<{owner: RegisteredUser; member: RegisteredUser}> {
    const owner = await registerUser(server);
    const member = await registerUser(server);

    const createFamily = await agent
        .post("/family/create")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({name: "The Test Family", currency: "USD"});
    expect(createFamily.status).toBe(201);

    const invite = await agent
        .post("/family/invite")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({email: member.user.email});
    expect(invite.status).toBe(201);

    const join = await agent.post(`/family/join/${invite.body.code}`).set("Authorization", `Bearer ${member.token}`);
    expect(join.status).toBe(204);

    // Re-login the member to refresh their JWT payload with the new familyId.
    const relogin = await agent.post("/auth/login").send({email: member.user.email, password: "uP$awLKjChrA#8N5xop!"});
    expect(relogin.status).toBe(201);
    return {owner, member: {token: relogin.body.token, user: member.user}};
}

describe("Account sharing (e2e)", () => {
    beforeAll(async () => {
        prisma = new PrismaClient({
            adapter: new PrismaPg({connectionString: process.env.DATABASE_URL}),
        });
        await prisma.$connect();
        await ensureInstanceConfig(prisma);

        const moduleRef = await Test.createTestingModule({imports: [AppModule]}).compile();
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
        await prisma.recurringTransactionExecutions.deleteMany();
        await prisma.recurringTransactions.deleteMany();
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

    test("owner shares an account with a family member and it appears in their list", async () => {
        const {owner, member} = await setupFamily();
        const account = await createAccount(owner.token, "Family joint");

        const share = await agent
            .post(`/account/${account.id}/shares`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({memberId: member.user.id, permission: "READ"});
        expect(share.status).toBe(201);

        const memberAccounts = await agent.get("/account").set("Authorization", `Bearer ${member.token}`);
        expect(memberAccounts.status).toBe(200);
        const shared = memberAccounts.body.find((a: {id: string}) => a.id === account.id);
        expect(shared).toBeDefined();
        expect(shared.access).toBe("read");
    });

    test("cannot share with someone outside the family", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);
        const account = await createAccount(owner.token);

        const createFamily = await agent
            .post("/family/create")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({name: "Solo Family", currency: "USD"});
        expect(createFamily.status).toBe(201);

        const share = await agent
            .post(`/account/${account.id}/shares`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({memberId: outsider.user.id, permission: "READ"});
        expect(share.status).toBe(403);
    });

    test("READ member can list transactions but cannot create them", async () => {
        const {owner, member} = await setupFamily();
        const account = await createAccount(owner.token);
        const category = await createCategory(owner.token);

        await agent.post(`/transaction/account/${account.id}`).set("Authorization", `Bearer ${owner.token}`).send({
            amount: -25,
            description: "Owner expense",
            date: new Date().toISOString(),
            categoryId: category.id,
            inBudget: true,
        });

        await agent
            .post(`/account/${account.id}/shares`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({memberId: member.user.id, permission: "READ"});

        const list = await agent
            .get(`/transaction?accountId=${account.id}&page=1&pageSize=20`)
            .set("Authorization", `Bearer ${member.token}`);
        expect(list.status).toBe(200);
        expect(list.body.total).toBe(1);

        const create = await agent
            .post(`/transaction/account/${account.id}`)
            .set("Authorization", `Bearer ${member.token}`)
            .send({
                amount: -10,
                description: "Sneaky",
                date: new Date().toISOString(),
                categoryId: category.id,
                inBudget: true,
            });
        expect(create.status).toBe(403);
    });

    test("WRITE member creates a transaction which uses the owner's categories", async () => {
        const {owner, member} = await setupFamily();
        const account = await createAccount(owner.token);
        const ownerCategory = await createCategory(owner.token, "OwnerCat");
        const memberCategory = await createCategory(member.token, "MemberCat");

        await agent
            .post(`/account/${account.id}/shares`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({memberId: member.user.id, permission: "WRITE"});

        const withMemberCategory = await agent
            .post(`/transaction/account/${account.id}`)
            .set("Authorization", `Bearer ${member.token}`)
            .send({
                amount: -20,
                description: "with member cat",
                date: new Date().toISOString(),
                categoryId: memberCategory.id,
                inBudget: true,
            });
        // Member cannot use their own category on the shared account.
        expect(withMemberCategory.status).toBe(404);

        const withOwnerCategory = await agent
            .post(`/transaction/account/${account.id}`)
            .set("Authorization", `Bearer ${member.token}`)
            .send({
                amount: -30,
                description: "with owner cat",
                date: new Date().toISOString(),
                categoryId: ownerCategory.id,
                inBudget: true,
            });
        expect(withOwnerCategory.status).toBe(201);
    });

    test("references endpoint scoped by accountId returns the owner's references", async () => {
        const {owner, member} = await setupFamily();
        const account = await createAccount(owner.token);
        await createCategory(owner.token, "OwnerCat");
        await createCategory(member.token, "MemberCat");

        await agent
            .post(`/account/${account.id}/shares`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({memberId: member.user.id, permission: "READ"});

        const scoped = await agent
            .get(`/reference/categories?accountId=${account.id}`)
            .set("Authorization", `Bearer ${member.token}`);
        expect(scoped.status).toBe(200);
        const names = scoped.body.map((c: {name: string}) => c.name);
        expect(names).toContain("OwnerCat");
        expect(names).not.toContain("MemberCat");

        const own = await agent.get("/reference/categories").set("Authorization", `Bearer ${member.token}`);
        expect(own.status).toBe(200);
        const ownNames = own.body.map((c: {name: string}) => c.name);
        expect(ownNames).toContain("MemberCat");
        expect(ownNames).not.toContain("OwnerCat");
    });

    test("budget on a shared account is visible read-only to a READ member", async () => {
        const {owner, member} = await setupFamily();
        const account = await createAccount(owner.token);
        const category = await createCategory(owner.token);

        await agent
            .post(`/account/${account.id}/shares`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({memberId: member.user.id, permission: "READ"});

        const budget = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({
                month: 4,
                year: 2026,
                budgetedIncome: 2000,
                categories: [{categoryId: category.id, amount: 300}],
                accountIds: [account.id],
            });
        expect(budget.status).toBe(201);

        const list = await agent.get("/budget/2026/4").set("Authorization", `Bearer ${member.token}`);
        expect(list.status).toBe(200);
        expect(list.body).toHaveLength(1);
        expect(list.body[0].id).toBe(budget.body.id);
        expect(list.body[0].effectivePermission).toBe("read");

        const forbiddenUpdate = await agent
            .put(`/budget/${budget.body.id}`)
            .set("Authorization", `Bearer ${member.token}`)
            .send({budgetedIncome: 1000});
        expect(forbiddenUpdate.status).toBe(403);
    });

    test("WRITE member can edit a shared budget but cannot change its accounts", async () => {
        const {owner, member} = await setupFamily();
        const account = await createAccount(owner.token);
        const other = await createAccount(owner.token, "Other");
        const category = await createCategory(owner.token);

        await agent
            .post(`/account/${account.id}/shares`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({memberId: member.user.id, permission: "WRITE"});

        const budget = await agent
            .post("/budget")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({
                month: 4,
                year: 2026,
                budgetedIncome: 2000,
                categories: [{categoryId: category.id, amount: 300}],
                accountIds: [account.id],
            });

        const income = await agent
            .put(`/budget/${budget.body.id}`)
            .set("Authorization", `Bearer ${member.token}`)
            .send({budgetedIncome: 3000});
        expect(income.status).toBe(200);
        expect(income.body.budgetedIncome).toBe(3000);

        const scope = await agent
            .put(`/budget/${budget.body.id}`)
            .set("Authorization", `Bearer ${member.token}`)
            .send({accountIds: [account.id, other.id]});
        expect(scope.status).toBe(403);
    });

    test("revoking a share detaches a cross-owner transfer but preserves the transactions", async () => {
        const {owner, member} = await setupFamily();
        const ownerAccount = await createAccount(owner.token, "OwnerAcc", 500);
        const memberAccount = await createAccount(member.token, "MemberAcc", 500);

        await agent
            .post(`/account/${ownerAccount.id}/shares`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({memberId: member.user.id, permission: "WRITE"});

        const transfer = await agent.post("/transfer").set("Authorization", `Bearer ${member.token}`).send({
            debitAccountId: ownerAccount.id,
            creditAccountId: memberAccount.id,
            amount: 100,
            description: "Cross-owner transfer",
            date: new Date().toISOString(),
            inBudget: false,
        });
        expect(transfer.status).toBe(201);
        const [debitTx, creditTx] = transfer.body;
        expect(debitTx.linkedTransactionId).toBe(creditTx.id);

        const revoke = await agent
            .delete(`/account/${ownerAccount.id}/shares/${member.user.id}`)
            .set("Authorization", `Bearer ${owner.token}`);
        expect(revoke.status).toBe(204);

        const debitAfter = await prisma.transactions.findUnique({where: {id: debitTx.id}});
        const creditAfter = await prisma.transactions.findUnique({where: {id: creditTx.id}});
        expect(debitAfter).not.toBeNull();
        expect(creditAfter).not.toBeNull();

        const transfersLeft = await prisma.transfers.count({
            where: {OR: [{debit_transaction_id: debitTx.id}, {credit_transaction_id: creditTx.id}]},
        });
        expect(transfersLeft).toBe(0);
    });

    test("owner-only actions on the account itself are refused to a WRITE member", async () => {
        const {owner, member} = await setupFamily();
        const account = await createAccount(owner.token);

        await agent
            .post(`/account/${account.id}/shares`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({memberId: member.user.id, permission: "WRITE"});

        const patch = await agent
            .patch(`/account/${account.id}`)
            .set("Authorization", `Bearer ${member.token}`)
            .send({name: "Renamed by sharee"});
        expect(patch.status).toBe(403);

        const del = await agent.delete(`/account/${account.id}`).set("Authorization", `Bearer ${member.token}`);
        expect(del.status).toBe(403);
    });
});
