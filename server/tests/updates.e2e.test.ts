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

const originalFetch = globalThis.fetch;

describe("UpdatesController (e2e)", () => {
    let app: NestFastifyApplication;
    let server: Server;
    let prisma: PrismaClient;
    let agent: ReturnType<typeof request.agent>;

    beforeAll(async () => {
        // Belt-and-braces: NODE_ENV=test already skips the update poll (see
        // updates.task.ts), but we also stub fetch in case any test triggers
        // an explicit refresh().
        globalThis.fetch = (async () =>
            ({
                ok: true,
                status: 200,
                statusText: "OK",
                headers: {get: () => null},
                json: async () => [],
            }) as unknown as Response) as unknown as typeof fetch;

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
        globalThis.fetch = originalFetch;
    });

    test("rejects unauthenticated requests", async () => {
        const res = await agent.get("/updates");
        expect(res.status).toBe(401);
    });

    test("returns update status shape when authenticated", async () => {
        const user = await registerUser(server, {username: "updates-user"});
        const res = await agent.get("/updates").set("Authorization", `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(typeof res.body.updateAvailable).toBe("boolean");
        expect(typeof res.body.currentVersion).toBe("string");
        expect("latest" in res.body).toBe(true);
        expect("checkedAt" in res.body).toBe(true);
    });
});
