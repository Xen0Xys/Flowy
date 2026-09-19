import {Injectable, InternalServerErrorException, Logger, OnModuleInit} from "@nestjs/common";
import argon2 from "argon2";
import crypto from "crypto";

// Fixed, non-secret salt: argon2 needs a salt but here we need determinism
// across restarts. Security comes from APP_SECRET, not from this salt.
const KDF_SALT = Buffer.from("flowy:mfa:v1:kdf".padEnd(16, "\0"), "utf-8");

@Injectable()
export class MfaCryptoService implements OnModuleInit {
    private readonly logger = new Logger(MfaCryptoService.name);
    private key: Buffer | null = null;

    async onModuleInit(): Promise<void> {
        const secret = process.env.APP_SECRET;
        if (!secret) throw new Error("APP_SECRET is required to derive MFA encryption key");

        const params =
            process.env.NODE_ENV === "production"
                ? {memoryCost: 2 ** 18, timeCost: 10, parallelism: 4}
                : {memoryCost: 2 ** 16, timeCost: 2, parallelism: 4};

        this.key = await argon2.hash(secret, {
            type: argon2.argon2id,
            salt: KDF_SALT,
            hashLength: 32,
            raw: true,
            ...params,
        });
        this.logger.log("MFA encryption key derived and cached in memory");
    }

    encrypt(plaintext: string): string {
        if (!this.key) throw new InternalServerErrorException("MFA crypto service not initialized");
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
        const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([iv, tag, ciphertext]).toString("base64");
    }

    decrypt(payload: string): string {
        if (!this.key) throw new InternalServerErrorException("MFA crypto service not initialized");
        const buffer = Buffer.from(payload, "base64");
        if (buffer.length < 12 + 16 + 1) throw new InternalServerErrorException("MFA payload malformed");
        const iv = buffer.subarray(0, 12);
        const tag = buffer.subarray(12, 28);
        const ciphertext = buffer.subarray(28);
        const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
        decipher.setAuthTag(tag);
        try {
            const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            return plaintext.toString("utf-8");
        } catch {
            throw new InternalServerErrorException("MFA payload authentication failed");
        }
    }
}
