import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import {config as loadEnv} from "dotenv";
import {afterAll, beforeAll, beforeEach, describe, expect, test} from "bun:test";
import {FastifyAdapter, NestFastifyApplication} from "@nestjs/platform-fastify";
import {ConfigKey, PrismaClient, UserRoles} from "../prisma/generated/client";
import {AccountTypes} from "../prisma/generated/enums";
import {CustomValidationPipe} from "../src/common/pipes/validation.pipe";
import {AppModule} from "../src/app.module";
import {PrismaPg} from "@prisma/adapter-pg";
import {Test} from "@nestjs/testing";
import {Server} from "node:http";
import request from "supertest";
import {buildRegisterPayload, ensureInstanceConfig, PASSWORD_BASE} from "./test-utils";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
    loadEnv({path: envPath});
}

describe("AdminController (e2e)", () => {
    let app: NestFastifyApplication;
    let server: Server;
    let prisma: PrismaClient;

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
        await prisma.familyInvites.deleteMany();
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
        await prisma.family.deleteMany();
        await prisma.config.update({
            where: {key: ConfigKey.REGISTRATION_ENABLED},
            data: {value: "true"},
        });
    });

    afterAll(async () => {
        if (app) await app.close();
        await prisma?.$disconnect();
    });

    test("owner can access instance settings", async () => {
        const payload = buildRegisterPayload();

        const reg = await request(server).post("/user/register").send(payload);
        expect(reg.status).toBe(201);
        const owner = reg.body;

        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const settings = await request(server)
            .get("/admin/instance/settings")
            .set("Authorization", `Bearer ${owner.token}`);
        expect(settings.status).toBe(200);
        expect(settings.body).toHaveProperty("registrationEnabled");
    });

    test("non-owner cannot access owner-only endpoints", async () => {
        const a = buildRegisterPayload();
        const b = buildRegisterPayload();

        const regA = await request(server).post("/user/register").send(a);
        expect(regA.status).toBe(201);
        const owner = regA.body;
        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const regB = await request(server).post("/user/register").send(b);
        expect(regB.status).toBe(201);
        const other = regB.body;

        const forbidden = await request(server)
            .get("/admin/instance/settings")
            .set("Authorization", `Bearer ${other.token}`);
        expect(forbidden.status).toBe(401);
        expect(forbidden.body.message).toBe("Only instance owner can access");
    });

    test("updates registration enabled flag", async () => {
        const ownerPayload = buildRegisterPayload();
        const ownerReg = await request(server).post("/user/register").send(ownerPayload);
        expect(ownerReg.status).toBe(201);
        const t = ownerReg.body.token;
        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: ownerReg.body.user.id},
            create: {
                key: "INSTANCE_OWNER" as any,
                value: ownerReg.body.user.id,
            },
        });

        const resp = await request(server)
            .patch("/admin/instance/registration_enabled")
            .set("Authorization", `Bearer ${t}`)
            .send({registrationEnabled: false});
        expect(resp.status).toBe(200);

        const cfg = await prisma.config.findUnique({
            where: {key: ConfigKey.REGISTRATION_ENABLED as any},
        });
        expect(cfg?.value).toBe("false");
    });

    test("lists users and allows deleting others but not self", async () => {
        const ownerPayload = buildRegisterPayload();
        const ownerReg = await request(server).post("/user/register").send(ownerPayload);
        expect(ownerReg.status).toBe(201);
        const owner = ownerReg.body;
        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const userPayload = buildRegisterPayload();
        const userReg = await request(server).post("/user/register").send(userPayload);
        expect(userReg.status).toBe(201);
        const user = userReg.body;

        const list = await request(server).get("/admin/users").set("Authorization", `Bearer ${owner.token}`);
        expect(list.status).toBe(200);
        expect(Array.isArray(list.body)).toBe(true);

        // delete other user
        const del = await request(server)
            .delete(`/admin/users/${user.user.id}`)
            .set("Authorization", `Bearer ${owner.token}`);
        expect(del.status).toBe(204);

        const found = await prisma.users.findUnique({
            where: {id: user.user.id},
        });
        expect(found).toBeNull();

        // cannot delete self
        const cannot = await request(server)
            .delete(`/admin/users/${owner.user.id}`)
            .set("Authorization", `Bearer ${owner.token}`);
        expect(cannot.status).toBe(401);
        expect(cannot.body.message).toBe("Cannot delete yourself");
    });

    test("instance owner can get family details from admin route", async () => {
        const ownerReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(ownerReg.status).toBe(201);
        const owner = ownerReg.body;

        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const familyAdminReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(familyAdminReg.status).toBe(201);
        const familyAdmin = familyAdminReg.body;

        const memberReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(memberReg.status).toBe(201);
        const member = memberReg.body;

        const createFamily = await request(server)
            .post("/family/create")
            .set("Authorization", `Bearer ${familyAdmin.token}`)
            .send({name: "AdminFamilyInfo", currency: "EUR"});
        expect(createFamily.status).toBe(201);

        const invite = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${familyAdmin.token}`)
            .send({email: member.user.email});
        expect(invite.status).toBe(201);

        const join = await request(server)
            .post(`/family/join/${invite.body.code}`)
            .set("Authorization", `Bearer ${member.token}`);
        expect(join.status).toBe(204);

        const family = await prisma.family.findFirstOrThrow({
            where: {name: "AdminFamilyInfo"},
        });

        const response = await request(server)
            .get(`/admin/family/${family.id}`)
            .set("Authorization", `Bearer ${owner.token}`);
        expect(response.status).toBe(200);
        expect(response.body.name).toBe("AdminFamilyInfo");
        expect(response.body.currency).toBe("EUR");
        expect(response.body.owner.id).toBe(familyAdmin.user.id);
        expect(response.body.members).toEqual(expect.arrayContaining([expect.objectContaining({id: member.user.id})]));
    });

    test("non-owner cannot access admin family details route", async () => {
        const ownerReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(ownerReg.status).toBe(201);
        const owner = ownerReg.body;

        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const familyAdminReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(familyAdminReg.status).toBe(201);
        const familyAdmin = familyAdminReg.body;

        const createFamily = await request(server)
            .post("/family/create")
            .set("Authorization", `Bearer ${familyAdmin.token}`)
            .send({name: "BlockedAdminFamilyInfo", currency: "USD"});
        expect(createFamily.status).toBe(201);

        const family = await prisma.family.findFirstOrThrow({
            where: {name: "BlockedAdminFamilyInfo"},
        });

        const otherReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(otherReg.status).toBe(201);
        const other = otherReg.body;

        const response = await request(server)
            .get(`/admin/family/${family.id}`)
            .set("Authorization", `Bearer ${other.token}`);
        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Only instance owner can access");
    });

    test("updates instance owner", async () => {
        const ownerPayload = buildRegisterPayload();
        const ownerReg = await request(server).post("/user/register").send(ownerPayload);
        expect(ownerReg.status).toBe(201);
        const owner = ownerReg.body;
        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const otherPayload = buildRegisterPayload();
        const otherReg = await request(server).post("/user/register").send(otherPayload);
        expect(otherReg.status).toBe(201);
        const other = otherReg.body;

        const changeOwner = await request(server)
            .patch("/admin/instance/owner")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ownerId: other.user.id});
        expect(changeOwner.status).toBe(204);

        const cfg = await prisma.config.findUnique({
            where: {key: "INSTANCE_OWNER" as any},
        });
        expect(cfg?.value).toBe(other.user.id);

        const forbidden = await request(server).get("/admin/users").set("Authorization", `Bearer ${owner.token}`);
        expect(forbidden.status).toBe(401);
    });

    test("admin (instance owner) can reset a user's password", async () => {
        const ownerPayload = buildRegisterPayload();
        const ownerReg = await request(server).post("/user/register").send(ownerPayload);
        expect(ownerReg.status).toBe(201);
        const owner = ownerReg.body;
        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const otherPayload = buildRegisterPayload();
        const otherReg = await request(server).post("/user/register").send(otherPayload);
        expect(otherReg.status).toBe(201);
        const other = otherReg.body;

        // owner resets other user's password
        const newPass = `AdminSet${PASSWORD_BASE}`;
        const reset = await request(server)
            .patch(`/admin/users/${other.user.id}/password`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({password: newPass});
        expect(reset.status).toBe(200);

        // login with old password fails
        const oldLogin = await request(server)
            .post("/user/login")
            .send({email: other.user.email, password: otherPayload.password});
        expect(oldLogin.status).toBe(401);

        // login with new password works
        const newLogin = await request(server).post("/user/login").send({email: other.user.email, password: newPass});
        expect(newLogin.status).toBe(201);
    });

    test("instance owner can run account integrity check and fix mismatched balances", async () => {
        const ownerReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(ownerReg.status).toBe(201);
        const owner = ownerReg.body;

        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const account = await prisma.accounts.create({
            data: {
                user_id: owner.user.id,
                type: AccountTypes.CHECKING,
                name: "Integrity test account",
                balance: 999,
            },
        });

        await prisma.transactions.create({
            data: {
                account_id: account.id,
                amount: 42,
                description: "Integrity seed",
                date: new Date(),
            },
        });

        const runCheck = await request(server)
            .post("/admin/integrity/account")
            .set("Authorization", `Bearer ${owner.token}`);
        expect(runCheck.status).toBe(204);

        const updatedAccount = await prisma.accounts.findUniqueOrThrow({
            where: {id: account.id},
        });
        expect(updatedAccount.balance).toBe(42);
    });

    test("non-owner cannot run account integrity check", async () => {
        const ownerReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(ownerReg.status).toBe(201);
        const owner = ownerReg.body;

        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const otherReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(otherReg.status).toBe(201);
        const other = otherReg.body;

        const response = await request(server)
            .post("/admin/integrity/account")
            .set("Authorization", `Bearer ${other.token}`);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Only instance owner can access");
    });

    test("deleting a solo family admin also deletes their family", async () => {
        const ownerReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(ownerReg.status).toBe(201);
        const owner = ownerReg.body;

        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const targetReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(targetReg.status).toBe(201);
        const target = targetReg.body;

        const createFamily = await request(server)
            .post("/family/create")
            .set("Authorization", `Bearer ${target.token}`)
            .send({name: "SoloFamily", currency: "EUR"});
        expect(createFamily.status).toBe(201);

        const family = await prisma.family.findFirstOrThrow({
            where: {name: "SoloFamily"},
        });

        const del = await request(server)
            .delete(`/admin/users/${target.user.id}`)
            .set("Authorization", `Bearer ${owner.token}`);
        expect(del.status).toBe(204);

        const deletedUser = await prisma.users.findUnique({
            where: {id: target.user.id},
        });
        expect(deletedUser).toBeNull();

        const deletedFamily = await prisma.family.findUnique({
            where: {id: family.id},
        });
        expect(deletedFamily).toBeNull();
    });

    test("deleting a family admin transfers admin role to another member", async () => {
        const ownerReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(ownerReg.status).toBe(201);
        const owner = ownerReg.body;

        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const adminReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(adminReg.status).toBe(201);
        const familyAdmin = adminReg.body;

        const memberReg = await request(server).post("/user/register").send(buildRegisterPayload());
        expect(memberReg.status).toBe(201);
        const member = memberReg.body;

        const createFamily = await request(server)
            .post("/family/create")
            .set("Authorization", `Bearer ${familyAdmin.token}`)
            .send({name: "SharedFamily", currency: "EUR"});
        expect(createFamily.status).toBe(201);

        const family = await prisma.family.findFirstOrThrow({
            where: {name: "SharedFamily"},
        });

        const invite = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${familyAdmin.token}`)
            .send({email: member.user.email});
        expect(invite.status).toBe(201);

        const join = await request(server)
            .post(`/family/join/${invite.body.code}`)
            .set("Authorization", `Bearer ${member.token}`);
        expect(join.status).toBe(204);

        const del = await request(server)
            .delete(`/admin/users/${familyAdmin.user.id}`)
            .set("Authorization", `Bearer ${owner.token}`);
        expect(del.status).toBe(204);

        const deletedUser = await prisma.users.findUnique({
            where: {id: familyAdmin.user.id},
        });
        expect(deletedUser).toBeNull();

        const keptFamily = await prisma.family.findUnique({
            where: {id: family.id},
        });
        expect(keptFamily).not.toBeNull();

        const refreshedMember = await prisma.users.findUnique({
            where: {id: member.user.id},
        });
        expect(refreshedMember?.family_id).toBe(family.id);
        expect(refreshedMember?.family_role).toBe(UserRoles.ADMIN);
    });
});
