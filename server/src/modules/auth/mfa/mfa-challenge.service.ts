import {Injectable} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import crypto from "crypto";
import {PrismaService} from "../../helper/prisma.service";
import type {MfaMethod} from "./mfa-factor.interface";
import {MFA_CHALLENGE_AUDIENCE, MFA_CHALLENGE_EXPIRES_IN, MFA_CHALLENGE_MAX_ATTEMPTS} from "./mfa.constants";

const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

// Shared building blocks for the MFA challenge lifecycle. Both password login
// (AuthService) and SSO login (SsoService) go through the same enrollment
// detection and challenge token issuance so the two flows can never drift.
@Injectable()
export class MfaChallengeService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) {}

    async getEnrolledMethods(userId: string): Promise<MfaMethod[]> {
        const methods: MfaMethod[] = [];
        const passkeyCount = await this.prisma.userPasskeys.count({where: {user_id: userId}});
        if (passkeyCount > 0) methods.push("passkey");

        const totp = await this.prisma.userTotpSecret.findUnique({
            where: {user_id: userId},
            select: {confirmed_at: true},
        });
        if (totp?.confirmed_at) methods.push("totp");

        const unusedBackup = await this.prisma.mfaBackupCodes.count({
            where: {user_id: userId, used_at: null},
        });
        if (unusedBackup > 0) methods.push("backup_code");
        return methods;
    }

    async generateChallengeToken(userId: string): Promise<string> {
        // Persist a per-challenge row so we can enforce single-use and cap the
        // number of attempts. The jti in the JWT is the row primary key.
        const jti = crypto.randomUUID();
        await this.prisma.mfaChallengeTokens.create({
            data: {
                id: jti,
                user_id: userId,
                attempts_remaining: MFA_CHALLENGE_MAX_ATTEMPTS,
                expires_at: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
            },
        });
        return this.jwtService.signAsync(
            {sub: userId},
            {audience: MFA_CHALLENGE_AUDIENCE, expiresIn: MFA_CHALLENGE_EXPIRES_IN, jwtid: jti},
        );
    }
}
