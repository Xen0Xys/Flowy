import crypto from "node:crypto";
import {ConfigKey, PrismaClient} from "../prisma/generated/client";
import {Server} from "node:http";
import request from "supertest";

export const PASSWORD_BASE = "uP$awLKjChrA#8N5xop!";

export function buildRegisterPayload(
    overrides: Partial<{
        username: string;
        email: string;
        password: string;
    }> = {},
) {
    const fallbackPassword = PASSWORD_BASE;
    const unique = crypto.randomUUID();
    return {
        username: overrides.username ?? `user-${unique.slice(0, 8)}`,
        email: overrides.email ?? `user-${unique}@e2e.test`,
        password: overrides.password ?? fallbackPassword,
    };
}

export async function ensureInstanceConfig(prismaClient: PrismaClient) {
    await prismaClient.config.upsert({
        where: {key: ConfigKey.SELF_HOSTED},
        update: {value: "true"},
        create: {key: ConfigKey.SELF_HOSTED, value: "true"},
    });
    await prismaClient.config.upsert({
        where: {key: ConfigKey.REGISTRATION_ENABLED},
        update: {value: "true"},
        create: {key: ConfigKey.REGISTRATION_ENABLED, value: "true"},
    });
}

export interface RegisteredUser {
    token: string;
    user: {
        id: string;
        email: string;
        username: string;
    };
}

export async function registerUser(
    server: Server,
    overrides: Partial<{
        username: string;
        email: string;
        password: string;
    }> = {},
): Promise<RegisteredUser> {
    const payload = buildRegisterPayload(overrides);
    const response = await request(server).post("/user/register").send(payload);

    if (response.status !== 201 || typeof response.body?.token !== "string") {
        throw new Error(`Failed to register test user: status=${response.status}`);
    }

    return response.body;
}
