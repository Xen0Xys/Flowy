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
import crypto from "node:crypto";
import request from "supertest";
import {buildRegisterPayload, createCsrfAgent, ensureInstanceConfig, registerUser} from "./test-utils";

describe("Security regression coverage (e2e)", () => {
    let app: NestFastifyApplication;
    let server: Server;
    let prisma: PrismaClient;
    let agent: ReturnType<typeof request.agent>;

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
        await prisma.familyInvites.deleteMany();
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
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

    test("SQL injection payload on login does not bypass authentication", async () => {
        const payload = buildRegisterPayload();
        const register = await agent.post("/auth/register").send(payload);
        expect(register.status).toBe(201);

        const attempt = await agent.post("/auth/login").send({
            email: `${payload.email}' OR '1'='1`,
            password: "irrelevant-password",
        });

        expect([400, 401]).toContain(attempt.status);
        expect(attempt.status).not.toBe(500);
    });

    test("NoSQL-style operator payloads are rejected by DTO validation", async () => {
        const attempt = await agent.post("/auth/login").send({
            email: {$gt: ""},
            password: {$ne: null},
        });

        expect(attempt.status).toBe(400);
        expect(Array.isArray(attempt.body.message)).toBe(true);
    });

    test("command-like input is treated as data and never escalates privileges", async () => {
        const payload = buildRegisterPayload({
            username: "cmd-$(whoami)-user",
        });

        const register = await agent.post("/auth/register").send(payload);

        expect([201, 400]).toContain(register.status);
        expect(register.status).not.toBe(500);

        if (register.status === 201) {
            expect(register.body.user.username).toBe(payload.username);

            const adminProbe = await agent.get("/admin/users").set("Authorization", `Bearer ${register.body.token}`);
            expect(adminProbe.status).toBe(401);
        }
    });

    test("forged JWT with alg=none is rejected", async () => {
        const token = buildNoneJwtToken();

        const response = await agent.get("/user/me").set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token");
    });

    test("expired JWT with expected signature algorithm is rejected", async () => {
        const token = buildExpiredHs512JwtToken();

        const response = await agent.get("/user/me").set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token");
    });

    test("mass-assignment attempt cannot set protected user fields", async () => {
        const payload = buildRegisterPayload();
        const attackerControlledJwtId = "attacker-fixed-jwt-id";

        const register = await agent.post("/auth/register").send({
            ...payload,
            family_id: "00000000-0000-0000-0000-000000000000",
            family_role: "ADMIN",
            jwt_id: attackerControlledJwtId,
            isAdmin: true,
            role: "OWNER",
        });

        expect(register.status).toBe(201);

        const stored = await prisma.users.findUniqueOrThrow({
            where: {email: payload.email},
        });
        expect(stored.family_id).toBeNull();
        expect(stored.family_role).toBeNull();
        expect(stored.jwt_id).not.toBe(attackerControlledJwtId);

        const adminProbe = await agent.get("/admin/users").set("Authorization", `Bearer ${register.body.token}`);
        expect(adminProbe.status).toBe(401);
    });

    test("error responses do not leak stack traces, SQL internals, or secrets", async () => {
        const owner = await registerUser(server);

        await prisma.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {value: owner.user.id},
            create: {key: "INSTANCE_OWNER" as any, value: owner.user.id},
        });

        const malformedIdResponse = await agent
            .get("/admin/family/not-a-uuid")
            .set("Authorization", `Bearer ${owner.token}`);

        expect([400, 404]).toContain(malformedIdResponse.status);

        const serialized = JSON.stringify(malformedIdResponse.body).toLowerCase();
        expect(serialized).not.toContain("select ");
        expect(serialized).not.toContain("insert ");
        expect(serialized).not.toContain("prisma");
        expect(serialized).not.toContain("stack");
        expect(serialized).not.toContain("password");
    });

    test("path traversal payload in route params is not resolved as filesystem access", async () => {
        const user = await registerUser(server);

        const response = await agent
            .post(`/family/join/${encodeURIComponent("../../etc/passwd")}`)
            .set("Authorization", `Bearer ${user.token}`);

        expect(response.status).not.toBe(500);
        const serialized = JSON.stringify(response.body).toLowerCase();
        expect(serialized).not.toContain("root:x:");
    });

    test("XML external entity payload is rejected and does not disclose local files", async () => {
        const xmlPayload = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
            "<login><email>&xxe;</email><password>irrelevant</password></login>",
        ].join("");

        const response = await agent.post("/auth/login").set("content-type", "application/xml").send(xmlPayload);

        expect([400, 401, 403, 415]).toContain(response.status);
        const serialized = JSON.stringify(response.body).toLowerCase();
        expect(serialized).not.toContain("root:x:");
        expect(serialized).not.toContain("file://");
    });
});

function buildNoneJwtToken(): string {
    const header = {
        alg: "none",
        typ: "JWT",
    };

    const payload = {
        sub: "forged-user-id",
        user_id: "forged-user-id",
        email: "attacker@e2e.test",
        jwt_id: "forged-jwt-id",
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
        iat: Math.floor(Date.now() / 1000),
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

    return `${encodedHeader}.${encodedPayload}.`;
}

function buildExpiredHs512JwtToken(): string {
    const secret = process.env.APP_SECRET;
    const issuer = process.env.APP_NAME;

    if (!secret || !issuer) {
        throw new Error("APP_SECRET and APP_NAME are required for expired JWT test");
    }

    const now = Math.floor(Date.now() / 1000);

    const header = {
        alg: "HS512",
        typ: "JWT",
    };

    const payload = {
        sub: "forged-user-id",
        user_id: "forged-user-id",
        email: "expired@e2e.test",
        jwt_id: "expired-jwt-id",
        iss: issuer,
        iat: now - 7200,
        exp: now - 3600,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.createHmac("sha512", secret).update(signingInput).digest("base64url");

    return `${signingInput}.${signature}`;
}
