import {BadRequestException, Injectable, Logger, UnauthorizedException} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import {PrismaService} from "../../helper/prisma.service";
import {UserService} from "../../users/user/user.service";
import {AuthService} from "../auth.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {MfaVerifyEntity} from "./models/entities/mfa-verify.entity";
import {TotpFactorService, TotpSetupResult} from "./factors/totp-factor.service";
import {BackupCodeFactorService} from "./factors/backup-code-factor.service";
import {PasskeyFactorService, PasskeySummary} from "./factors/passkey-factor.service";
import type {
    AuthenticationResponseJSON,
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
    RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {MFA_CHALLENGE_AUDIENCE} from "./mfa.constants";

interface MfaChallengePayload {
    sub: string;
    jti?: string;
    aud?: string;
}

export interface SensitiveActionProof {
    code?: string;
    passkeyResponse?: AuthenticationResponseJSON;
}

interface ChallengeSession {
    userId: string;
    jti: string;
}

type CodeMethod = "totp" | "backup_code";

@Injectable()
export class MfaService {
    private readonly logger = new Logger(MfaService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly userService: UserService,
        private readonly authService: AuthService,
        private readonly totpFactor: TotpFactorService,
        private readonly backupCodeFactor: BackupCodeFactorService,
        private readonly passkeyFactor: PasskeyFactorService,
    ) {}

    async setupTotp(user: UserEntity, currentPassword: string): Promise<TotpSetupResult> {
        await this.userService.verifyPassword(user, currentPassword);
        return this.totpFactor.generateSecret(user.id, user.email);
    }

    async confirmTotpSetup(
        user: UserEntity,
        code: string,
    ): Promise<{backupCodes: string[] | null; token: string | null}> {
        const ok = await this.totpFactor.confirmSetup(user.id, code);
        if (!ok) throw new UnauthorizedException("Invalid verification code");

        if (user.mfaEnabled) {
            // MFA was already enabled via passkey: adding TOTP as an extra
            // factor should not invalidate existing backup codes or tokens.
            this.logger.log(`TOTP added to existing MFA user=${user.id}`);
            return {backupCodes: null, token: null};
        }

        const {backupCodes, token} = await this.enableMfaAndIssueToken(user);
        this.logger.log(`MFA enabled user=${user.id} via=totp`);
        return {backupCodes: backupCodes ?? [], token};
    }

    async removeTotpFactor(user: UserEntity, currentPassword: string, code: string): Promise<void> {
        // Q3: TOTP removal must be authorised by a valid TOTP code (per-factor
        // proof); passkey assertions are handled by deletePasskey.
        await this.userService.verifyPassword(user, currentPassword);
        const ok = await this.totpFactor.verify(user.id, code);
        if (!ok) throw new UnauthorizedException("Invalid verification code");

        await this.totpFactor.purge(user.id);

        const passkeyCount = await this.passkeyFactor.countForUser(user.id);
        if (passkeyCount === 0) {
            await this.purgeMfa(user.id);
            await this.authService.invalidateTokens(user);
            this.logger.log(`MFA disabled after TOTP removed (no passkey left) user=${user.id}`);
            return;
        }

        this.logger.log(`TOTP factor removed user=${user.id} passkeysRemaining=${passkeyCount}`);
    }

    async disableAllMfa(user: UserEntity, currentPassword: string, proof: SensitiveActionProof): Promise<void> {
        await this.userService.verifyPassword(user, currentPassword);
        await this.verifyAnyFactor(user.id, proof);

        await this.purgeMfa(user.id);
        await this.authService.invalidateTokens(user);

        this.logger.log(`MFA fully disabled user=${user.id}`);
    }

    async regenerateBackupCodes(
        user: UserEntity,
        currentPassword: string,
        proof: SensitiveActionProof,
    ): Promise<string[]> {
        await this.userService.verifyPassword(user, currentPassword);
        await this.verifyAnyFactor(user.id, proof);

        const codes = await this.backupCodeFactor.generate(user.id);
        this.logger.log(`Backup codes regenerated user=${user.id}`);
        return codes;
    }

    async verifyChallenge(challengeToken: string, code: string, method: CodeMethod): Promise<MfaVerifyEntity> {
        const session = await this.openChallenge(challengeToken);
        const factor = method === "totp" ? this.totpFactor : this.backupCodeFactor;

        const ok = await factor.verify(session.userId, code);
        if (!ok) {
            await this.failChallenge(session);
            throw new UnauthorizedException("Invalid verification code");
        }
        await this.completeChallenge(session);

        // Q1: never auto-disable MFA after backup-code login. Backup codes are a
        // per-code recovery escape hatch, not an MFA kill switch: keep TOTP and
        // passkeys intact.
        return this.buildVerifyResult(session.userId);
    }

    async getFactors(user: UserEntity): Promise<{
        mfaEnabled: boolean;
        totpEnrolled: boolean;
        passkeyCount: number;
        unusedBackupCodes: number;
    }> {
        const [totpEnrolled, passkeyCount, unusedBackupCodes] = await Promise.all([
            this.totpFactor.isEnrolledFor(user.id),
            this.passkeyFactor.countForUser(user.id),
            this.prisma.mfaBackupCodes.count({where: {user_id: user.id, used_at: null}}),
        ]);
        return {
            mfaEnabled: user.mfaEnabled,
            totpEnrolled,
            passkeyCount,
            unusedBackupCodes,
        };
    }

    // Passkey management (settings)

    async listPasskeys(user: UserEntity): Promise<PasskeySummary[]> {
        return this.passkeyFactor.listForUser(user.id);
    }

    async startPasskeyRegistration(
        user: UserEntity,
        currentPassword: string,
    ): Promise<PublicKeyCredentialCreationOptionsJSON> {
        await this.userService.verifyPassword(user, currentPassword);
        return this.passkeyFactor.generateRegistrationOptions(user.id, user.username, user.email);
    }

    async confirmPasskeyRegistration(
        user: UserEntity,
        response: RegistrationResponseJSON,
        label: string,
    ): Promise<{passkey: PasskeySummary; token: string | null; backupCodes: string[] | null}> {
        const wasEnabled = user.mfaEnabled;
        const passkey = await this.passkeyFactor.verifyRegistration(user.id, response, label);

        if (wasEnabled) {
            return {passkey, token: null, backupCodes: null};
        }
        const {backupCodes, token} = await this.enableMfaAndIssueToken(user);
        this.logger.log(`MFA enabled user=${user.id} via=passkey`);
        return {passkey, token, backupCodes: backupCodes ?? []};
    }

    async renamePasskey(user: UserEntity, passkeyId: string, label: string): Promise<PasskeySummary> {
        return this.passkeyFactor.rename(user.id, passkeyId, label);
    }

    async deletePasskey(
        user: UserEntity,
        passkeyId: string,
        currentPassword: string,
        passkeyResponse: AuthenticationResponseJSON,
    ): Promise<void> {
        // Q3: passkey deletion must be authorised by a passkey assertion
        // (per-factor proof) so a stolen password alone cannot silently
        // downgrade a user to password-only.
        await this.userService.verifyPassword(user, currentPassword);
        const ok = await this.passkeyFactor.verifySettingsAuthentication(user.id, passkeyResponse);
        if (!ok) throw new UnauthorizedException("Invalid passkey response");

        await this.passkeyFactor.delete(user.id, passkeyId);

        // If this was the last passkey and no TOTP is enrolled, MFA has no
        // remaining factor: disable it and invalidate tokens.
        const [passkeyCount, totpEnrolled] = await Promise.all([
            this.passkeyFactor.countForUser(user.id),
            this.totpFactor.isEnrolledFor(user.id),
        ]);
        if (passkeyCount === 0 && !totpEnrolled) {
            await this.purgeMfa(user.id);
            await this.authService.invalidateTokens(user);
            this.logger.log(`MFA disabled after last passkey removed user=${user.id}`);
        }
    }

    async startPasskeySettingsChallenge(user: UserEntity): Promise<PublicKeyCredentialRequestOptionsJSON> {
        return this.passkeyFactor.generateSettingsAuthOptions(user.id);
    }

    // Passkey login flow

    async startPasskeyChallenge(challengeToken: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
        // Peek without consuming: /passkey/challenge/options is idempotent, the
        // client may retry it before /verify.
        const {userId} = await this.peekChallenge(challengeToken);
        return this.passkeyFactor.generateAuthenticationOptions(userId);
    }

    async verifyPasskeyChallenge(
        challengeToken: string,
        response: AuthenticationResponseJSON,
    ): Promise<MfaVerifyEntity> {
        const session = await this.openChallenge(challengeToken);
        const ok = await this.passkeyFactor.verifyAuthentication(session.userId, response);
        if (!ok) {
            await this.failChallenge(session);
            throw new UnauthorizedException("Invalid passkey response");
        }
        await this.completeChallenge(session);
        return this.buildVerifyResult(session.userId);
    }

    async resetForUser(userId: string): Promise<void> {
        await this.purgeMfa(userId);
        const user = await this.prisma.users.findUniqueOrThrow({where: {id: userId}});
        await this.authService.invalidateTokens(UserService.toUserEntity(user));
    }

    async hasMfaEnabled(userId: string): Promise<boolean> {
        const user = await this.prisma.users.findUnique({where: {id: userId}, select: {mfa_enabled: true}});
        return user?.mfa_enabled === true;
    }

    async verifyAnyFactor(userId: string, proof: SensitiveActionProof): Promise<void> {
        if (proof.passkeyResponse) {
            const ok = await this.passkeyFactor.verifySettingsAuthentication(userId, proof.passkeyResponse);
            if (!ok) throw new UnauthorizedException("Invalid passkey response");
            return;
        }

        if (!proof.code) {
            throw new BadRequestException("A verification code or a passkey response is required");
        }

        const totpOk = await this.totpFactor.verify(userId, proof.code);
        if (totpOk) return;

        const backupOk = await this.backupCodeFactor.verify(userId, proof.code);
        if (backupOk) return;

        throw new UnauthorizedException("Invalid verification code");
    }

    private async enableMfaAndIssueToken(user: UserEntity): Promise<{token: string; backupCodes: string[] | null}> {
        const backupCodes = await this.backupCodeFactor.generate(user.id);

        await this.prisma.users.update({
            where: {id: user.id},
            data: {mfa_enabled: true},
        });
        await this.authService.invalidateTokens(user);

        const refreshed = await this.prisma.users.findUniqueOrThrow({where: {id: user.id}});
        const refreshedEntity = UserService.toUserEntity(refreshed);
        const token = await this.authService.generateToken(refreshedEntity);
        return {token, backupCodes};
    }

    private async buildVerifyResult(userId: string): Promise<MfaVerifyEntity> {
        const user = await this.prisma.users.findUnique({where: {id: userId}});
        if (!user) throw new UnauthorizedException("Invalid verification code");
        let userEntity = UserService.toUserEntity(user);
        // Rotate jwt_id after a successful MFA verification: any pre-existing
        // session token is invalidated, so MFA acts as a hard session boundary.
        await this.authService.invalidateTokens(userEntity);
        const refreshed = await this.prisma.users.findUniqueOrThrow({where: {id: userId}});
        userEntity = UserService.toUserEntity(refreshed);
        const token = await this.authService.generateToken(userEntity);
        return new MfaVerifyEntity({user: userEntity, token, mfaAutoDisabled: false});
    }

    private async purgeMfa(userId: string): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.userTotpSecret.deleteMany({where: {user_id: userId}}),
            this.prisma.mfaBackupCodes.deleteMany({where: {user_id: userId}}),
            this.prisma.userPasskeys.deleteMany({where: {user_id: userId}}),
            this.prisma.webAuthnChallenges.deleteMany({where: {user_id: userId}}),
            this.prisma.mfaChallengeTokens.deleteMany({where: {user_id: userId}}),
            this.prisma.users.update({where: {id: userId}, data: {mfa_enabled: false}}),
        ]);
    }

    // Challenge lifecycle: parse JWT, ensure the DB row still exists and is not
    // expired. openChallenge is used before a verify attempt so we can decrement
    // attempts_remaining on failure and delete the row on success. peekChallenge
    // is used by /passkey/challenge/options which does not itself consume an
    // attempt.

    private async openChallenge(challengeToken: string): Promise<ChallengeSession> {
        const {userId, jti} = await this.parseChallengePayload(challengeToken);
        const row = await this.prisma.mfaChallengeTokens.findUnique({where: {id: jti}});
        if (!row || row.user_id !== userId || row.expires_at.getTime() < Date.now()) {
            if (row) await this.prisma.mfaChallengeTokens.delete({where: {id: jti}}).catch(() => undefined);
            throw new UnauthorizedException("Invalid or expired challenge token");
        }
        return {userId, jti};
    }

    private async peekChallenge(challengeToken: string): Promise<ChallengeSession> {
        return this.openChallenge(challengeToken);
    }

    private async completeChallenge(session: ChallengeSession): Promise<void> {
        await this.prisma.mfaChallengeTokens.delete({where: {id: session.jti}}).catch(() => undefined);
    }

    private async failChallenge(session: ChallengeSession): Promise<void> {
        // Atomic decrement + auto-delete when exhausted, keyed by the row id.
        // Two racing failures cannot double-decrement past 0 because updateMany
        // requires attempts_remaining > 1.
        const decremented = await this.prisma.mfaChallengeTokens.updateMany({
            where: {id: session.jti, attempts_remaining: {gt: 1}},
            data: {attempts_remaining: {decrement: 1}},
        });
        if (decremented.count === 0) {
            await this.prisma.mfaChallengeTokens.delete({where: {id: session.jti}}).catch(() => undefined);
        }
    }

    private async parseChallengePayload(challengeToken: string): Promise<{userId: string; jti: string}> {
        try {
            const payload = await this.jwtService.verifyAsync<MfaChallengePayload>(challengeToken, {
                audience: MFA_CHALLENGE_AUDIENCE,
            });
            if (!payload?.sub || !payload.jti) {
                throw new BadRequestException("Invalid challenge token");
            }
            return {userId: payload.sub, jti: payload.jti};
        } catch {
            throw new UnauthorizedException("Invalid or expired challenge token");
        }
    }
}
