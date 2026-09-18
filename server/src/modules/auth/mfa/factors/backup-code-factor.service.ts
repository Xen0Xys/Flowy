import {Injectable, Logger} from "@nestjs/common";
import argon2 from "argon2";
import crypto from "crypto";
import {PrismaService} from "../../../helper/prisma.service";
import type {CodeMfaFactor, MfaMethod} from "../mfa-factor.interface";

const CODE_COUNT = 10;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/I/0/1
const CODE_LENGTH = 8;

@Injectable()
export class BackupCodeFactorService implements CodeMfaFactor {
    readonly method: MfaMethod = "backup_code";
    private readonly logger = new Logger(BackupCodeFactorService.name);

    constructor(private readonly prisma: PrismaService) {}

    async isEnrolledFor(userId: string): Promise<boolean> {
        const count = await this.prisma.mfaBackupCodes.count({
            where: {user_id: userId, used_at: null},
        });
        return count > 0;
    }

    async generate(userId: string): Promise<string[]> {
        const codes = Array.from({length: CODE_COUNT}, () => this.randomCode());
        const params =
            process.env.NODE_ENV === "production"
                ? {memoryCost: 2 ** 18, timeCost: 10, parallelism: 4}
                : {memoryCost: 2 ** 16, timeCost: 2, parallelism: 4};

        const hashes = await Promise.all(
            codes.map((code) =>
                argon2.hash(this.normalize(code), {
                    type: argon2.argon2id,
                    ...params,
                }),
            ),
        );

        await this.prisma.$transaction([
            this.prisma.mfaBackupCodes.deleteMany({where: {user_id: userId}}),
            this.prisma.mfaBackupCodes.createMany({
                data: hashes.map((code_hash) => ({user_id: userId, code_hash})),
            }),
        ]);

        return codes.map((code) => this.format(code));
    }

    async verify(userId: string, code: string): Promise<boolean> {
        const normalized = this.normalize(code);
        if (!this.isValidFormat(normalized)) return false;

        const rows = await this.prisma.mfaBackupCodes.findMany({
            where: {user_id: userId, used_at: null},
        });

        const results = await Promise.all(
            rows.map((row) => argon2.verify(row.code_hash, normalized).catch(() => false)),
        );
        const matched = results.reduce<string | null>(
            (acc, ok, index) => acc ?? (ok ? (rows[index]?.id ?? null) : null),
            null,
        );
        if (!matched) return false;

        await this.prisma.mfaBackupCodes.update({
            where: {id: matched},
            data: {used_at: new Date()},
        });
        this.logger.log(`Backup code consumed user=${userId}`);
        return true;
    }

    async purge(userId: string): Promise<void> {
        await this.prisma.mfaBackupCodes.deleteMany({where: {user_id: userId}});
    }

    private randomCode(): string {
        const bytes = crypto.randomBytes(CODE_LENGTH);
        let out = "";
        for (let i = 0; i < CODE_LENGTH; i++) {
            out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
        }
        return out;
    }

    private normalize(code: string): string {
        return code.replace(/[\s-]+/g, "").toUpperCase();
    }

    private isValidFormat(normalized: string): boolean {
        if (normalized.length !== CODE_LENGTH) return false;
        for (const ch of normalized) {
            if (!CODE_ALPHABET.includes(ch)) return false;
        }
        return true;
    }

    private format(code: string): string {
        return `${code.slice(0, 4)}-${code.slice(4)}`;
    }
}
