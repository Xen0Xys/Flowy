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

    test("requires authentication for reference routes", async () => {
        const categories = await agent.get("/reference/categories");
        expect(categories.status).toBe(401);
        expect(categories.body.message).toBe("Authorization token is missing");

        const merchants = await agent.get("/reference/merchants");
        expect(merchants.status).toBe(401);
        expect(merchants.body.message).toBe("Authorization token is missing");
    });

    test("rejects invalid token for reference routes", async () => {
        const categories = await agent.get("/reference/categories").set("Authorization", "Bearer invalid-token");

        expect(categories.status).toBe(401);
        expect(categories.body.message).toBe("Invalid or expired token");

        const merchants = await agent.get("/reference/merchants").set("Authorization", "Bearer invalid-token");

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

        const categoriesResponse = await agent
            .get("/reference/categories")
            .set("Authorization", `Bearer ${userA.token}`);

        expect(categoriesResponse.status).toBe(200);
        expect(categoriesResponse.body).toHaveLength(2);
        expect(categoriesResponse.body[0].name).toBe("Alimentation");
        expect(categoriesResponse.body[1].name).toBe("Transport");
        expect(categoriesResponse.body[0].userId).toBe(userA.user.id);
        expect(categoriesResponse.body[0].hexColor).toBe("#22C55E");
        expect(categoriesResponse.body[0].icon).toBe("utensils");

        const merchantsResponse = await agent.get("/reference/merchants").set("Authorization", `Bearer ${userA.token}`);

        expect(merchantsResponse.status).toBe(200);
        expect(merchantsResponse.body).toHaveLength(2);
        expect(merchantsResponse.body[0].name).toBe("Amazon");
        expect(merchantsResponse.body[1].name).toBe("Carrefour");
        expect(merchantsResponse.body[0].userId).toBe(userA.user.id);
    });

    test("returns empty lists when user has no references", async () => {
        const user = await registerUser(server);

        const categoriesResponse = await agent.get("/reference/categories").set("Authorization", `Bearer ${user.token}`);
        expect(categoriesResponse.status).toBe(200);
        expect(categoriesResponse.body).toEqual([]);

        const merchantsResponse = await agent.get("/reference/merchants").set("Authorization", `Bearer ${user.token}`);
        expect(merchantsResponse.status).toBe(200);
        expect(merchantsResponse.body).toEqual([]);
    });

    test("creates, updates and deletes a category", async () => {
        const user = await registerUser(server);

        const create = await agent.post("/reference/category").set("Authorization", `Bearer ${user.token}`).send({
            name: "Food",
            hexColor: "#22C55E",
            icon: "utensils",
        });

        expect(create.status).toBe(201);
        expect(create.body.name).toBe("Food");
        expect(create.body.hexColor).toBe("#22C55E");
        expect(create.body.icon).toBe("utensils");
        expect(create.body.userId).toBe(user.user.id);

        const update = await agent
            .patch(`/reference/category/${create.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "Dining",
                hexColor: "#16A34A",
                icon: "restaurant",
            });

        expect(update.status).toBe(200);
        expect(update.body.name).toBe("Dining");
        expect(update.body.hexColor).toBe("#16A34A");
        expect(update.body.icon).toBe("restaurant");

        const remove = await agent
            .delete(`/reference/category/${create.body.id}`)
            .set("Authorization", `Bearer ${user.token}`);

        expect(remove.status).toBe(200);

        const deleted = await prisma.userCategories.findUnique({
            where: {id: create.body.id},
        });
        expect(deleted).toBeNull();
    });

    test("creates, updates and deletes a merchant", async () => {
        const user = await registerUser(server);

        const create = await agent.post("/reference/merchant").set("Authorization", `Bearer ${user.token}`).send({
            name: "Amazon",
        });

        expect(create.status).toBe(201);
        expect(create.body.name).toBe("Amazon");
        expect(create.body.userId).toBe(user.user.id);

        const update = await agent
            .patch(`/reference/merchant/${create.body.id}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "Amazon Prime",
            });

        expect(update.status).toBe(200);
        expect(update.body.name).toBe("Amazon Prime");

        const remove = await agent
            .delete(`/reference/merchant/${create.body.id}`)
            .set("Authorization", `Bearer ${user.token}`);

        expect(remove.status).toBe(200);

        const deleted = await prisma.userMerchants.findUnique({
            where: {id: create.body.id},
        });
        expect(deleted).toBeNull();
    });

    test("rejects duplicate category and merchant names for the same user", async () => {
        const user = await registerUser(server);

        const firstCategory = await agent.post("/reference/category").set("Authorization", `Bearer ${user.token}`).send({
            name: "Health",
            hexColor: "#EF4444",
            icon: "heart",
        });
        expect(firstCategory.status).toBe(201);

        const duplicateCategory = await agent
            .post("/reference/category")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "Health",
                hexColor: "#F97316",
                icon: "medical-cross",
            });

        expect(duplicateCategory.status).toBe(409);
        expect(duplicateCategory.body.message).toBe("Category already exists");

        const firstMerchant = await agent.post("/reference/merchant").set("Authorization", `Bearer ${user.token}`).send({
            name: "Ikea",
        });
        expect(firstMerchant.status).toBe(201);

        const duplicateMerchant = await agent
            .post("/reference/merchant")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "Ikea",
            });

        expect(duplicateMerchant.status).toBe(409);
        expect(duplicateMerchant.body.message).toBe("Merchant already exists");
    });

    test("rejects update/delete on references owned by another user", async () => {
        const owner = await registerUser(server);
        const outsider = await registerUser(server);

        const category = await prisma.userCategories.create({
            data: {
                user_id: owner.user.id,
                name: "Owner category",
                hex_color: "#8B5CF6",
                icon: "briefcase",
            },
        });

        const merchant = await prisma.userMerchants.create({
            data: {
                user_id: owner.user.id,
                name: "Owner merchant",
            },
        });

        const updateCategory = await agent
            .patch(`/reference/category/${category.id}`)
            .set("Authorization", `Bearer ${outsider.token}`)
            .send({name: "Hacked"});
        expect(updateCategory.status).toBe(403);
        expect(updateCategory.body.message).toBe("You do not have permission to access this category");

        const deleteCategory = await agent
            .delete(`/reference/category/${category.id}`)
            .set("Authorization", `Bearer ${outsider.token}`);
        expect(deleteCategory.status).toBe(403);
        expect(deleteCategory.body.message).toBe("You do not have permission to access this category");

        const updateMerchant = await agent
            .patch(`/reference/merchant/${merchant.id}`)
            .set("Authorization", `Bearer ${outsider.token}`)
            .send({name: "Hacked"});
        expect(updateMerchant.status).toBe(403);
        expect(updateMerchant.body.message).toBe("You do not have permission to access this merchant");

        const deleteMerchant = await agent
            .delete(`/reference/merchant/${merchant.id}`)
            .set("Authorization", `Bearer ${outsider.token}`);
        expect(deleteMerchant.status).toBe(403);
        expect(deleteMerchant.body.message).toBe("You do not have permission to access this merchant");
    });

    test("rejects invalid payloads and invalid UUID params", async () => {
        const user = await registerUser(server);

        const badCreateCategory = await agent
            .post("/reference/category")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                name: "",
                hexColor: "green",
                icon: "",
            });

        expect(badCreateCategory.status).toBe(400);
        expect(badCreateCategory.body.message).toEqual(
            expect.arrayContaining([
                expect.objectContaining({property: "name"}),
                expect.objectContaining({property: "hexColor"}),
                expect.objectContaining({property: "icon"}),
            ]),
        );

        const badCreateMerchant = await agent
            .post("/reference/merchant")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: ""});

        expect(badCreateMerchant.status).toBe(400);
        expect(badCreateMerchant.body.message).toEqual(
            expect.arrayContaining([expect.objectContaining({property: "name"})]),
        );

        const badCategoryId = await agent
            .patch("/reference/category/not-a-uuid")
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Updated"});
        expect(badCategoryId.status).toBe(400);

        const badMerchantId = await agent
            .delete("/reference/merchant/not-a-uuid")
            .set("Authorization", `Bearer ${user.token}`);
        expect(badMerchantId.status).toBe(400);
    });

    test("returns 404 for missing references", async () => {
        const user = await registerUser(server);
        const missingCategoryId = "0195c8dd-c263-7569-99f6-9fc20aca3050";
        const missingMerchantId = "0195c8dd-c263-7569-99f6-9fc20aca3051";

        const updateCategory = await agent
            .patch(`/reference/category/${missingCategoryId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Missing"});
        expect(updateCategory.status).toBe(404);
        expect(updateCategory.body.message).toBe("Category not found");

        const deleteCategory = await agent
            .delete(`/reference/category/${missingCategoryId}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(deleteCategory.status).toBe(404);
        expect(deleteCategory.body.message).toBe("Category not found");

        const updateMerchant = await agent
            .patch(`/reference/merchant/${missingMerchantId}`)
            .set("Authorization", `Bearer ${user.token}`)
            .send({name: "Missing"});
        expect(updateMerchant.status).toBe(404);
        expect(updateMerchant.body.message).toBe("Merchant not found");

        const deleteMerchant = await agent
            .delete(`/reference/merchant/${missingMerchantId}`)
            .set("Authorization", `Bearer ${user.token}`);
        expect(deleteMerchant.status).toBe(404);
        expect(deleteMerchant.body.message).toBe("Merchant not found");
    });
});
