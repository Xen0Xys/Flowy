import {Injectable, Logger} from "@nestjs/common";
import {TOTP, Secret} from "otpauth";
import {PrismaService} from "../../../helper/prisma.service";
import {MfaCryptoService} from "../../../helper/mfa-crypto.service";
import type {MfaFactor, MfaMethod} from "../mfa-factor.interface";

const TOTP_ISSUER_FALLBACK = "Flowy";
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_ALGORITHM = "SHA1";
const TOTP_WINDOW = 1;

export interface TotpSetupResult {
    secret: string;
    otpauthUrl: string;
}

@Injectable()
export class TotpFactorService implements MfaFactor {
    readonly method: MfaMethod = "totp";
    private readonly logger = new Logger(TotpFactorService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: MfaCryptoService,
    ) {}

    async isEnrolledFor(userId: string): Promise<boolean> {
        const row = await this.prisma.userTotpSecret.findUnique({where: {user_id: userId}});
        return !!row?.encrypted_secret && !!row.confirmed_at;
    }

    async generateSecret(userId: string, accountLabel: string): Promise<TotpSetupResult> {
        const secret = new Secret({size: 20}).base32;
        const issuer = process.env.APP_NAME || TOTP_ISSUER_FALLBACK;

        const totp = new TOTP({
            issuer,
            label: accountLabel,
            algorithm: TOTP_ALGORITHM,
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD,
            secret,
        });

        const encrypted = this.crypto.encrypt(secret);

        await this.prisma.userTotpSecret.upsert({
            where: {user_id: userId},
            update: {pending_secret: encrypted, encrypted_secret: null, confirmed_at: null, last_used_step: null},
            create: {user_id: userId, pending_secret: encrypted},
        });

        return {secret, otpauthUrl: totp.toString()};
    }

    async confirmSetup(userId: string, code: string): Promise<boolean> {
        const row = await this.prisma.userTotpSecret.findUnique({where: {user_id: userId}});
        if (!row?.pending_secret) return false;

        const secret = this.crypto.decrypt(row.pending_secret);
        const step = this.validateCode(secret, code);
        if (step === null) return false;

        await this.prisma.userTotpSecret.update({
            where: {user_id: userId},
            data: {
                encrypted_secret: row.pending_secret,
                pending_secret: null,
                confirmed_at: new Date(),
                last_used_step: BigInt(step),
            },
        });
        return true;
    }

    async verify(userId: string, code: string): Promise<boolean> {
        const row = await this.prisma.userTotpSecret.findUnique({where: {user_id: userId}});
        if (!row?.encrypted_secret) return false;

        const secret = this.crypto.decrypt(row.encrypted_secret);
        const step = this.validateCode(secret, code);
        if (step === null) return false;

        if (row.last_used_step !== null && BigInt(step) <= row.last_used_step) {
            this.logger.warn(`Replay detected user=${userId} step=${step}`);
            return false;
        }

        await this.prisma.userTotpSecret.update({
            where: {user_id: userId},
            data: {last_used_step: BigInt(step)},
        });
        return true;
    }

    async purge(userId: string): Promise<void> {
        await this.prisma.userTotpSecret.deleteMany({where: {user_id: userId}});
    }

    async cancelPending(userId: string): Promise<void> {
        const row = await this.prisma.userTotpSecret.findUnique({where: {user_id: userId}});
        if (!row) return;
        if (row.encrypted_secret) {
            await this.prisma.userTotpSecret.update({
                where: {user_id: userId},
                data: {pending_secret: null},
            });
        } else {
            await this.prisma.userTotpSecret.delete({where: {user_id: userId}});
        }
    }

    private validateCode(secret: string, code: string): number | null {
        const normalized = code.replace(/\s+/g, "");
        if (!/^\d{6}$/.test(normalized)) return null;

        const totp = new TOTP({
            algorithm: TOTP_ALGORITHM,
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD,
            secret,
        });

        const delta = totp.validate({token: normalized, window: TOTP_WINDOW});
        if (delta === null) return null;

        const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
        return currentStep + delta;
    }
}
