import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import {config as loadEnv} from "dotenv";
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
} from "bun:test";
import {FastifyAdapter, NestFastifyApplication} from "@nestjs/platform-fastify";
import {ConfigKey, PrismaClient} from "../prisma/generated/client";
import {CustomValidationPipe} from "../src/common/pipes/validation.pipe";
import {AppModule} from "../src/app.module";
import {PrismaPg} from "@prisma/adapter-pg";
import {Test} from "@nestjs/testing";
import {Server} from "node:http";
import request from "supertest";
import {ensureInstanceConfig, registerUser} from "./test-utils";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
    loadEnv({path: envPath});
}

let app: NestFastifyApplication;
let server: Server;
let prisma: PrismaClient;

describe("ReferenceController (e2e)", () => {
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

        app = moduleRef.createNestApplication<NestFastifyApplication>(
            new FastifyAdapter({exposeHeadRoutes: true}),
        );
        app.useGlobalPipes(new CustomValidationPipe());
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
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
        await prisma.familyInvites.deleteMany();
        await prisma.family.deleteMany();
        await prisma.config.update({
            where: {key: ConfigKey.REGISTRATION_ENABLED},
            data: {value: "true"},
        });
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
        await prisma?.$disconnect();
    });

    test("requires authentication for reference routes", async () => {
        const categories = await request(server).get("/reference/categories");
        expect(categories.status).toBe(401);
        expect(categories.body.message).toBe("Authorization token is missing");

        const merchants = await request(server).get("/reference/merchants");
        expect(merchants.status).toBe(401);
        expect(merchants.body.message).toBe("Authorization token is missing");
    });

    test("rejects invalid token for reference routes", async () => {
        const categories = await request(server)
            .get("/reference/categories")
            .set("Authorization", "Bearer invalid-token");

        expect(categories.status).toBe(401);
        expect(categories.body.message).toBe("Invalid or expired token");

        const merchants = await request(server)
            .get("/reference/merchants")
            .set("Authorization", "Bearer invalid-token");

        expect(merchants.status).toBe(401);
        expect(merchants.body.message).toBe("Invalid or expired token");
    });

    test("lists only current user's categories and merchants", async () => {
        const userA = await registerUser(server);
        const userB = await registerUser(server);

        await prisma.userCategories.createMany({
            data: [
                {
                    user_id: userA.user.id,
                    name: "Alimentation",
                    hex_color: "#22C55E",
                    icon: "utensils",
                },
                {
                    user_id: userA.user.id,
                    name: "Transport",
                    hex_color: "#3B82F6",
                    icon: "car",
                },
                {
                    user_id: userB.user.id,
                    name: "Other user category",
                    hex_color: "#F97316",
                    icon: "briefcase",
                },
            ],
        });

        await prisma.userMerchants.createMany({
            data: [
                {
                    user_id: userA.user.id,
                    name: "Amazon",
                },
                {
                    user_id: userA.user.id,
                    name: "Carrefour",
                },
                {
                    user_id: userB.user.id,
                    name: "Other user merchant",
                },
            ],
        });

        const categoriesResponse = await request(server)
            .get("/reference/categories")
            .set("Authorization", `Bearer ${userA.token}`);

        expect(categoriesResponse.status).toBe(200);
        expect(categoriesResponse.body).toHaveLength(2);
        expect(categoriesResponse.body[0].name).toBe("Alimentation");
        expect(categoriesResponse.body[1].name).toBe("Transport");
        expect(categoriesResponse.body[0].userId).toBe(userA.user.id);
        expect(categoriesResponse.body[0].hexColor).toBe("#22C55E");
        expect(categoriesResponse.body[0].icon).toBe("utensils");

        const merchantsResponse = await request(server)
            .get("/reference/merchants")
            .set("Authorization", `Bearer ${userA.token}`);

        expect(merchantsResponse.status).toBe(200);
        expect(merchantsResponse.body).toHaveLength(2);
        expect(merchantsResponse.body[0].name).toBe("Amazon");
        expect(merchantsResponse.body[1].name).toBe("Carrefour");
        expect(merchantsResponse.body[0].userId).toBe(userA.user.id);
    });

    test("returns empty lists when user has no references", async () => {
        const user = await registerUser(server);

        const categoriesResponse = await request(server)
            .get("/reference/categories")
            .set("Authorization", `Bearer ${user.token}`);
        expect(categoriesResponse.status).toBe(200);
        expect(categoriesResponse.body).toEqual([]);

        const merchantsResponse = await request(server)
            .get("/reference/merchants")
            .set("Authorization", `Bearer ${user.token}`);
        expect(merchantsResponse.status).toBe(200);
        expect(merchantsResponse.body).toEqual([]);
    });
});
