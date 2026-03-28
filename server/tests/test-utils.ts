import {ConfigKey, PrismaClient} from "../prisma/generated/client";
import request from "supertest";
import {Server} from "http";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({
    path: ".env",
    quiet: true,
});
dotenv.config({
    path: "server/.env",
    quiet: true,
});

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

export async function createCsrfAgent(server: Server): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(server);
    const csrfResponse = await agent.get("/auth/csrf");

    if (csrfResponse.status !== 200 || typeof csrfResponse.body?.csrfToken !== "string") {
        throw new Error(`Failed to fetch CSRF token: status=${csrfResponse.status}`);
    }

    agent.set("x-csrf-token", csrfResponse.body.csrfToken);
    return agent;
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
    const agent = await createCsrfAgent(server);
    const response = await agent.post("/auth/register").send(payload);

    if (response.status !== 201 || typeof response.body?.token !== "string") {
        throw new Error(`Failed to register test user: status=${response.status}`);
    }

    return response.body;
}
