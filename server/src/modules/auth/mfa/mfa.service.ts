import {BadRequestException, Injectable, Logger, UnauthorizedException} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import {PrismaService} from "../../helper/prisma.service";
import {UserService} from "../../users/user/user.service";
import {AuthService} from "../auth.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {LoginUserEntity} from "../../users/user/models/entities/login-user.entity";
import {TotpFactorService, TotpSetupResult} from "./factors/totp-factor.service";
import {BackupCodeFactorService} from "./factors/backup-code-factor.service";
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
    ) {}

    async setupTotp(user: UserEntity, currentPassword: string): Promise<TotpSetupResult> {
        await this.userService.verifyPassword(user, currentPassword);
        return this.totpFactor.generateSecret(user.id, user.email);
    }

    async confirmTotpSetup(user: UserEntity, code: string): Promise<{backupCodes: string[]; token: string}> {
        const ok = await this.totpFactor.confirmSetup(user.id, code);
        if (!ok) throw new UnauthorizedException("Invalid verification code");

        const backupCodes = await this.backupCodeFactor.generate(user.id);

        await this.prisma.users.update({
            where: {id: user.id},
            data: {mfa_enabled: true},
        });
        await this.authService.invalidateTokens(user);

        const refreshed = await this.prisma.users.findUniqueOrThrow({where: {id: user.id}});
        const refreshedEntity = UserService.toUserEntity(refreshed);
        const token = await this.authService.generateToken(refreshedEntity);

        this.logger.log(`MFA enabled user=${user.id}`);
        return {backupCodes, token};
    }

    async disableMfa(user: UserEntity, currentPassword: string, code: string): Promise<void> {
        await this.userService.verifyPassword(user, currentPassword);

        const totpOk = await this.totpFactor.verify(user.id, code);
        const backupOk = totpOk ? false : await this.backupCodeFactor.verify(user.id, code);
        if (!totpOk && !backupOk) throw new UnauthorizedException("Invalid verification code");

        await this.prisma.$transaction([
            this.prisma.userTotpSecret.deleteMany({where: {user_id: user.id}}),
            this.prisma.mfaBackupCodes.deleteMany({where: {user_id: user.id}}),
            this.prisma.users.update({where: {id: user.id}, data: {mfa_enabled: false}}),
        ]);
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

    async verifyChallenge(challengeToken: string, code: string, method: MfaMethod): Promise<LoginUserEntity> {
        const userId = await this.consumeChallengeToken(challengeToken);
        const factor = method === "totp" ? this.totpFactor : this.backupCodeFactor;

        const ok = await factor.verify(userId, code);
        if (!ok) throw new UnauthorizedException("Invalid verification code");

        const user = await this.prisma.users.findUnique({where: {id: userId}});
        if (!user) throw new UnauthorizedException("Invalid verification code");

        const userEntity = UserService.toUserEntity(user);
        const token = await this.authService.generateToken(userEntity);
        return new LoginUserEntity({user: userEntity, token});
    }

    async resetForUser(userId: string): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.userTotpSecret.deleteMany({where: {user_id: userId}}),
            this.prisma.mfaBackupCodes.deleteMany({where: {user_id: userId}}),
            this.prisma.users.update({where: {id: userId}, data: {mfa_enabled: false}}),
        ]);
        const user = await this.prisma.users.findUniqueOrThrow({where: {id: userId}});
        await this.authService.invalidateTokens(UserService.toUserEntity(user));
    }

    private async consumeChallengeToken(challengeToken: string): Promise<string> {
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
