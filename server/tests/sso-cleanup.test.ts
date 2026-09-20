// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {afterAll, beforeAll, beforeEach, describe, expect, test} from "bun:test";
import {PrismaClient} from "../prisma/generated/client";
import {PrismaPg} from "@prisma/adapter-pg";
import {Test} from "@nestjs/testing";
import {AppModule} from "../src/app.module";
import {SsoCleanupService} from "../src/modules/auth/sso/sso-cleanup.service";
import crypto from "node:crypto";

let prisma: PrismaClient;
let service: SsoCleanupService;
let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>["compile"]>>;

function makeStateId(): string {
    return crypto.randomBytes(24).toString("base64url");
}

describe("SsoCleanupService", () => {
    beforeAll(async () => {
        prisma = new PrismaClient({
            adapter: new PrismaPg({connectionString: process.env.DATABASE_URL}),
        });
        await prisma.$connect();

        moduleRef = await Test.createTestingModule({imports: [AppModule]}).compile();
        service = moduleRef.get(SsoCleanupService);
    });

    beforeEach(async () => {
        await prisma.ssoStates.deleteMany();
    });

    afterAll(async () => {
        await moduleRef?.close();
        await prisma?.$disconnect();
    });

    test("deletes expired SSO states and keeps valid ones", async () => {
        const now = Date.now();
        await prisma.ssoStates.createMany({
            data: [
                {
                    id: makeStateId(),
                    provider_slug: "provider-a",
                    code_verifier: "verifier-1",
                    purpose: "login",
                    expires_at: new Date(now - 60_000),
                },
                {
                    id: makeStateId(),
                    provider_slug: "provider-a",
                    code_verifier: "verifier-2",
                    purpose: "link",
                    expires_at: new Date(now - 5_000),
                },
                {
                    id: makeStateId(),
                    provider_slug: "provider-a",
                    code_verifier: "verifier-3",
                    purpose: "login",
                    expires_at: new Date(now + 60_000),
                },
            ],
        });

        await service.cleanupExpired();

        const remaining = await prisma.ssoStates.findMany();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].code_verifier).toBe("verifier-3");
    });

    test("is a no-op when nothing is expired", async () => {
        await prisma.ssoStates.create({
            data: {
                id: makeStateId(),
                provider_slug: "provider-b",
                code_verifier: "verifier",
                purpose: "login",
                expires_at: new Date(Date.now() + 60_000),
            },
        });
        await service.cleanupExpired();
        expect(await prisma.ssoStates.count()).toBe(1);
    });
});
