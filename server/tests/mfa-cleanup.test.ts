// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {afterAll, beforeAll, beforeEach, describe, expect, test} from "bun:test";
import {PrismaClient} from "../prisma/generated/client";
import {PrismaPg} from "@prisma/adapter-pg";
import {Test} from "@nestjs/testing";
import {AppModule} from "../src/app.module";
import {MfaCleanupService} from "../src/modules/auth/mfa/mfa-cleanup.service";
import argon2 from "argon2";
import crypto from "node:crypto";

let prisma: PrismaClient;
let service: MfaCleanupService;
let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>["compile"]>>;

async function createUserRecord(): Promise<{id: string}> {
    const unique = crypto.randomUUID();
    const user = await prisma.users.create({
        data: {
            username: `cleanup-${unique.slice(0, 8)}`,
            email: `cleanup-${unique}@e2e.test`,
            password: await argon2.hash("password"),
            jwt_id: crypto.randomBytes(16).toString("hex"),
        },
    });
    return {id: user.id};
}

describe("MfaCleanupService", () => {
    beforeAll(async () => {
        prisma = new PrismaClient({
            adapter: new PrismaPg({connectionString: process.env.DATABASE_URL}),
        });
        await prisma.$connect();

        moduleRef = await Test.createTestingModule({imports: [AppModule]}).compile();
        service = moduleRef.get(MfaCleanupService);
    });

    beforeEach(async () => {
        await prisma.mfaChallengeTokens.deleteMany();
        await prisma.webAuthnChallenges.deleteMany();
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
    });

    afterAll(async () => {
        await moduleRef?.close();
        await prisma?.$disconnect();
    });

    test("deletes expired MFA challenge tokens and webauthn challenges, keeps valid ones", async () => {
        const user = await createUserRecord();
        const now = Date.now();

        await prisma.mfaChallengeTokens.createMany({
            data: [
                {
                    id: crypto.randomUUID(),
                    user_id: user.id,
                    attempts_remaining: 3,
                    expires_at: new Date(now - 60_000),
                },
                {
                    id: crypto.randomUUID(),
                    user_id: user.id,
                    attempts_remaining: 3,
                    expires_at: new Date(now - 5_000),
                },
                {
                    id: crypto.randomUUID(),
                    user_id: user.id,
                    attempts_remaining: 3,
                    expires_at: new Date(now + 60_000),
                },
            ],
        });

        await prisma.webAuthnChallenges.create({
            data: {
                user_id: user.id,
                challenge: "expired-challenge",
                purpose: "auth",
                expires_at: new Date(now - 1_000),
            },
        });

        await service.cleanupExpired();

        const remainingTokens = await prisma.mfaChallengeTokens.count();
        expect(remainingTokens).toBe(1);
        const remainingWebauthn = await prisma.webAuthnChallenges.count();
        expect(remainingWebauthn).toBe(0);
    });

    test("is a no-op when nothing is expired", async () => {
        const user = await createUserRecord();
        await prisma.mfaChallengeTokens.create({
            data: {
                id: crypto.randomUUID(),
                user_id: user.id,
                attempts_remaining: 3,
                expires_at: new Date(Date.now() + 60_000),
            },
        });
        await service.cleanupExpired();
        expect(await prisma.mfaChallengeTokens.count()).toBe(1);
    });
});
