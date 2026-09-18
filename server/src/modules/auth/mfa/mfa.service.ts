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
import type {AuthenticationResponseJSON, RegistrationResponseJSON} from "@simplewebauthn/server";
import type {MfaMethod} from "./mfa-factor.interface";

const MFA_CHALLENGE_AUDIENCE = "MFA_CHALLENGE";

interface MfaChallengePayload {
    sub: string;
    aud?: string;
}

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

    async confirmTotpSetup(user: UserEntity, code: string): Promise<{backupCodes: string[]; token: string}> {
        const ok = await this.totpFactor.confirmSetup(user.id, code);
        if (!ok) throw new UnauthorizedException("Invalid verification code");

        const {backupCodes, token} = await this.enableMfaAndIssueToken(user, {regenerateBackupCodes: true});
        this.logger.log(`MFA enabled user=${user.id} via=totp`);
        return {backupCodes: backupCodes ?? [], token};
    }

    async disableMfa(user: UserEntity, currentPassword: string, code: string): Promise<void> {
        await this.userService.verifyPassword(user, currentPassword);

        const totpOk = await this.totpFactor.verify(user.id, code);
        const backupOk = totpOk ? false : await this.backupCodeFactor.verify(user.id, code);
        if (!totpOk && !backupOk) throw new UnauthorizedException("Invalid verification code");

        await this.purgeMfa(user.id);
        await this.authService.invalidateTokens(user);

        this.logger.log(`MFA disabled user=${user.id}`);
    }

    async regenerateBackupCodes(user: UserEntity, currentPassword: string, code: string): Promise<string[]> {
        await this.userService.verifyPassword(user, currentPassword);

        const ok = await this.totpFactor.verify(user.id, code);
        if (!ok) throw new UnauthorizedException("Invalid verification code");

        const codes = await this.backupCodeFactor.generate(user.id);
        this.logger.log(`Backup codes regenerated user=${user.id}`);
        return codes;
    }

    async verifyChallenge(challengeToken: string, code: string, method: MfaMethod): Promise<MfaVerifyEntity> {
        if (method === "passkey") {
            throw new BadRequestException("Passkey challenges must be verified through the passkey endpoints");
        }
        const userId = await this.consumeChallengeToken(challengeToken);
        const factor = method === "totp" ? this.totpFactor : this.backupCodeFactor;

        const ok = await factor.verify(userId, code);
        if (!ok) throw new UnauthorizedException("Invalid verification code");

        const mfaAutoDisabled = method === "backup_code";
        if (mfaAutoDisabled) {
            await this.purgeMfa(userId);
            this.logger.log(`MFA auto-disabled after backup code login user=${userId}`);
        }

        return this.buildVerifyResult(userId, mfaAutoDisabled);
    }

    // Passkey management (settings)

    async listPasskeys(user: UserEntity): Promise<PasskeySummary[]> {
        return this.passkeyFactor.listForUser(user.id);
    }

    async startPasskeyRegistration(user: UserEntity, currentPassword: string) {
        await this.userService.verifyPassword(user, currentPassword);
        return this.passkeyFactor.generateRegistrationOptions(user.id, user.email);
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
        const {backupCodes, token} = await this.enableMfaAndIssueToken(user, {regenerateBackupCodes: true});
        this.logger.log(`MFA enabled user=${user.id} via=passkey`);
        return {passkey, token, backupCodes: backupCodes ?? []};
    }

    async renamePasskey(user: UserEntity, passkeyId: string, label: string): Promise<PasskeySummary> {
        return this.passkeyFactor.rename(user.id, passkeyId, label);
    }

    async deletePasskey(user: UserEntity, passkeyId: string, currentPassword: string): Promise<void> {
        await this.userService.verifyPassword(user, currentPassword);
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

    // Passkey login flow

    async startPasskeyChallenge(challengeToken: string) {
        const userId = await this.peekChallengeToken(challengeToken);
        return this.passkeyFactor.generateAuthenticationOptions(userId);
    }

    async verifyPasskeyChallenge(
        challengeToken: string,
        response: AuthenticationResponseJSON,
    ): Promise<MfaVerifyEntity> {
        const userId = await this.consumeChallengeToken(challengeToken);
        const ok = await this.passkeyFactor.verifyAuthentication(userId, response);
        if (!ok) throw new UnauthorizedException("Invalid passkey response");
        return this.buildVerifyResult(userId, false);
    }

    async resetForUser(userId: string): Promise<void> {
        await this.purgeMfa(userId);
        const user = await this.prisma.users.findUniqueOrThrow({where: {id: userId}});
        await this.authService.invalidateTokens(UserService.toUserEntity(user));
    }

    private async enableMfaAndIssueToken(
        user: UserEntity,
        opts: {regenerateBackupCodes: boolean},
    ): Promise<{token: string; backupCodes: string[] | null}> {
        const backupCodes = opts.regenerateBackupCodes ? await this.backupCodeFactor.generate(user.id) : null;

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

    private async buildVerifyResult(userId: string, mfaAutoDisabled: boolean): Promise<MfaVerifyEntity> {
        const user = await this.prisma.users.findUnique({where: {id: userId}});
        if (!user) throw new UnauthorizedException("Invalid verification code");
        const userEntity = UserService.toUserEntity(user);
        const token = await this.authService.generateToken(userEntity);
        return new MfaVerifyEntity({user: userEntity, token, mfaAutoDisabled});
    }

    private async purgeMfa(userId: string): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.userTotpSecret.deleteMany({where: {user_id: userId}}),
            this.prisma.mfaBackupCodes.deleteMany({where: {user_id: userId}}),
            this.prisma.userPasskeys.deleteMany({where: {user_id: userId}}),
            this.prisma.webAuthnChallenges.deleteMany({where: {user_id: userId}}),
            this.prisma.users.update({where: {id: userId}, data: {mfa_enabled: false}}),
        ]);
    }

    private async consumeChallengeToken(challengeToken: string): Promise<string> {
        return this.parseChallengeToken(challengeToken);
    }

    private async peekChallengeToken(challengeToken: string): Promise<string> {
        return this.parseChallengeToken(challengeToken);
    }

    private async parseChallengeToken(challengeToken: string): Promise<string> {
        try {
            const payload = await this.jwtService.verifyAsync<MfaChallengePayload>(challengeToken, {
                audience: MFA_CHALLENGE_AUDIENCE,
            });
            if (!payload?.sub) throw new BadRequestException("Invalid challenge token");
            return payload.sub;
        } catch {
            throw new UnauthorizedException("Invalid or expired challenge token");
        }
    }
}
