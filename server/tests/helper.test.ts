// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {afterEach, beforeEach, describe, expect, test} from "bun:test";
import {InternalServerErrorException} from "@nestjs/common";
import {MfaCryptoService} from "../src/modules/helper/mfa-crypto.service";
import {InstanceConfigService} from "../src/modules/helper/instance-config.service";
import {WebAuthnConfigService} from "../src/modules/helper/webauthn-config.service";
import {ConfigKey} from "../prisma/generated/enums";

// ─── MfaCryptoService ─────────────────────────────────────────────────

describe("MfaCryptoService", () => {
    test("encrypt() throws when service is not initialized", () => {
        const service = new MfaCryptoService();
        expect(() => service.encrypt("plaintext")).toThrow(InternalServerErrorException);
    });

    test("decrypt() throws when service is not initialized", () => {
        const service = new MfaCryptoService();
        expect(() => service.decrypt("ignored")).toThrow(InternalServerErrorException);
    });

    test("encrypt then decrypt roundtrips original plaintext", async () => {
        const service = new MfaCryptoService();
        await service.onModuleInit();
        const encrypted = service.encrypt("hello world");
        expect(encrypted).not.toBe("hello world");
        const decrypted = service.decrypt(encrypted);
        expect(decrypted).toBe("hello world");
    });

    test("decrypt() rejects malformed payload", async () => {
        const service = new MfaCryptoService();
        await service.onModuleInit();
        expect(() => service.decrypt("short")).toThrow(InternalServerErrorException);
    });

    test("decrypt() rejects tampered ciphertext", async () => {
        const service = new MfaCryptoService();
        await service.onModuleInit();
        const encrypted = service.encrypt("hello world");
        const buffer = Buffer.from(encrypted, "base64");
        buffer[buffer.length - 1] = buffer[buffer.length - 1] ^ 0xff;
        expect(() => service.decrypt(buffer.toString("base64"))).toThrow(InternalServerErrorException);
    });

    test("onModuleInit() throws when APP_SECRET is missing", async () => {
        const previous = process.env.APP_SECRET;
        delete process.env.APP_SECRET;
        try {
            const service = new MfaCryptoService();
            await expect(service.onModuleInit()).rejects.toBeInstanceOf(Error);
        } finally {
            if (previous !== undefined) process.env.APP_SECRET = previous;
        }
    });
});

// ─── InstanceConfigService ────────────────────────────────────────────

describe("InstanceConfigService", () => {
    test("isSelfHosted returns true when config value is 'true'", async () => {
        const prisma: any = {
            config: {
                findUnique: async ({where}: any) => {
                    if (where.key === ConfigKey.SELF_HOSTED) return {value: "true"};
                    return null;
                },
            },
        };
        const service = new InstanceConfigService(prisma);
        expect(await service.isSelfHosted()).toBe(true);
    });

    test("isSelfHosted returns false when config value is not 'true'", async () => {
        const prisma: any = {
            config: {
                findUnique: async () => ({value: "false"}),
            },
        };
        const service = new InstanceConfigService(prisma);
        expect(await service.isSelfHosted()).toBe(false);
    });

    test("isSelfHosted throws when config is missing", async () => {
        const prisma: any = {config: {findUnique: async () => null}};
        const service = new InstanceConfigService(prisma);
        await expect(service.isSelfHosted()).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    test("registrationAllowed returns true when value is 'true'", async () => {
        const prisma: any = {config: {findUnique: async () => ({value: "true"})}};
        const service = new InstanceConfigService(prisma);
        expect(await service.registrationAllowed()).toBe(true);
    });

    test("registrationAllowed throws when config is missing", async () => {
        const prisma: any = {config: {findUnique: async () => null}};
        const service = new InstanceConfigService(prisma);
        await expect(service.registrationAllowed()).rejects.toBeInstanceOf(InternalServerErrorException);
    });
});

// ─── WebAuthnConfigService ────────────────────────────────────────────

describe("WebAuthnConfigService", () => {
    const originalEnv = {...process.env};

    beforeEach(() => {
        process.env = {...originalEnv};
    });

    afterEach(() => {
        process.env = {...originalEnv};
    });

    test("derives rpID from the first origin in development", () => {
        delete process.env.WEBAUTHN_RP_ID;
        process.env.NODE_ENV = "test";
        process.env.WEBAUTHN_ORIGINS = "https://app.example.com,https://other";
        const service = new WebAuthnConfigService();
        expect(service.rpID).toBe("app.example.com");
        expect(service.origins).toEqual(["https://app.example.com", "https://other"]);
    });

    test("uses explicit WEBAUTHN_RP_ID when provided", () => {
        process.env.WEBAUTHN_RP_ID = "custom.example";
        process.env.WEBAUTHN_ORIGINS = "https://custom.example";
        const service = new WebAuthnConfigService();
        expect(service.rpID).toBe("custom.example");
    });

    test("falls back to APP_NAME then default 'Flowy' for rpName", () => {
        delete process.env.WEBAUTHN_RP_NAME;
        process.env.APP_NAME = "MyApp";
        process.env.WEBAUTHN_ORIGINS = "https://custom.example";
        const service = new WebAuthnConfigService();
        expect(service.rpName).toBe("MyApp");

        delete process.env.APP_NAME;
        process.env.WEBAUTHN_ORIGINS = "https://custom.example";
        const bare = new WebAuthnConfigService();
        expect(bare.rpName).toBe("Flowy");
    });

    test("throws when origins list is empty", () => {
        process.env.WEBAUTHN_ORIGINS = ",  , ";
        process.env.CORS_ORIGINS = "";
        expect(() => new WebAuthnConfigService()).toThrow();
    });

    test("throws when WEBAUTHN_RP_ID is unset in production", () => {
        delete process.env.WEBAUTHN_RP_ID;
        process.env.NODE_ENV = "production";
        process.env.WEBAUTHN_ORIGINS = "https://custom.example";
        expect(() => new WebAuthnConfigService()).toThrow();
    });

    test("throws when first origin is not a valid URL and no rpID is set", () => {
        delete process.env.WEBAUTHN_RP_ID;
        process.env.NODE_ENV = "test";
        process.env.WEBAUTHN_ORIGINS = "not a url";
        expect(() => new WebAuthnConfigService()).toThrow();
    });
});
