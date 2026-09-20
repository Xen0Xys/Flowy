import {ConflictException, Injectable, Logger, UnauthorizedException} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import crypto from "crypto";
import argon2 from "argon2";
import {Users} from "../../../prisma/generated/client";
import {UserEntity} from "../users/user/models/entities/user.entity";
import {LoginUserEntity} from "../users/user/models/entities/login-user.entity";
import {MfaChallengeEntity} from "./mfa/models/entities/mfa-challenge.entity";
import type {MfaMethod} from "./mfa/mfa-factor.interface";
import {MFA_CHALLENGE_AUDIENCE, MFA_CHALLENGE_EXPIRES_IN, MFA_CHALLENGE_MAX_ATTEMPTS} from "./mfa/mfa.constants";
import {InstanceConfigService} from "../helper/instance-config.service";
import {PrismaService} from "../helper/prisma.service";

export type LoginResponse = LoginUserEntity | MfaChallengeEntity;

const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
    private readonly logger: Logger = new Logger(AuthService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly instanceConfigService: InstanceConfigService,
        private readonly jwtService: JwtService,
    ) {}

    async generateToken(user: UserEntity): Promise<string> {
        const payload = {sub: user.id};
        return this.jwtService.signAsync(payload, {
            jwtid: user.jwtId,
            audience: "AUTH",
        });
    }

    async register(username: string, email: string, password: string): Promise<LoginUserEntity> {
        if (!(await this.instanceConfigService.registrationAllowed())) {
            throw new UnauthorizedException("Registration is disabled on this instance");
        }

        const existingUser: Users | null = await this.prismaService.users.findFirst({
            where: {
                email,
            },
        });
        if (existingUser) throw new ConflictException("Username or email already exists");

        let hashed: string;
        if (process.env.NODE_ENV !== "production") {
            hashed = await argon2.hash(password, {
                type: argon2.argon2id,
                memoryCost: 2 ** 16,
                timeCost: 2,
                parallelism: 4,
            });
            this.logger.warn("Using weaker password hashing parameters in non-production environment");
        } else {
            hashed = await argon2.hash(password, {
                type: argon2.argon2id,
                memoryCost: 2 ** 18,
                timeCost: 10,
                parallelism: 4,
            });
        }

        const user = await this.prismaService.users.create({
            data: {
                username,
                email,
                password: hashed,
                jwt_id: crypto.randomBytes(16).toString("hex"),
            },
        });

        await this.prismaService.config.upsert({
            where: {key: "INSTANCE_OWNER" as any},
            update: {},
            create: {key: "INSTANCE_OWNER" as any, value: user.id},
        });

        const userEntity: UserEntity = this.toUserEntity(user);
        return new LoginUserEntity({
            user: userEntity,
            token: await this.generateToken(userEntity),
        });
    }

    async login(email: string, password: string): Promise<LoginResponse> {
        const user = await this.prismaService.users.findFirst({
            where: {email},
        });
        if (!user) throw new UnauthorizedException("Invalid email or password");

        if (!user.password) {
            // SSO-only account: no local password to verify against. Give the
            // same generic error as a bad password to avoid leaking whether
            // the account exists but is SSO-only.
            throw new UnauthorizedException("Invalid email or password");
        }

        const valid = await argon2.verify(user.password, password);
        if (!valid) throw new UnauthorizedException("Invalid email or password");

        if (user.mfa_enabled) {
            const methods = await this.getEnrolledMfaMethods(user.id);
            const challengeToken = await this.generateMfaChallengeToken(user.id);
            return new MfaChallengeEntity({challengeToken, methods});
        }

        const userEntity: UserEntity = this.toUserEntity(user);
        return new LoginUserEntity({
            user: userEntity,
            token: await this.generateToken(userEntity),
        });
    }

    async invalidateTokens(user: UserEntity): Promise<void> {
        await this.prismaService.users.update({
            where: {id: user.id},
            data: {
                jwt_id: crypto.randomBytes(16).toString("hex"),
            },
        });
    }

    private async getEnrolledMfaMethods(userId: string): Promise<MfaMethod[]> {
        const methods: MfaMethod[] = [];
        const passkeyCount = await this.prismaService.userPasskeys.count({where: {user_id: userId}});
        if (passkeyCount > 0) methods.push("passkey");

        const totp = await this.prismaService.userTotpSecret.findUnique({
            where: {user_id: userId},
            select: {confirmed_at: true},
        });
        if (totp?.confirmed_at) methods.push("totp");

        const unusedBackup = await this.prismaService.mfaBackupCodes.count({
            where: {user_id: userId, used_at: null},
        });
        if (unusedBackup > 0) methods.push("backup_code");
        return methods;
    }

    private async generateMfaChallengeToken(userId: string): Promise<string> {
        // Persist a per-challenge row so we can enforce single-use and cap the
        // number of attempts. The jti in the JWT is the row primary key.
        const jti = crypto.randomUUID();
        await this.prismaService.mfaChallengeTokens.create({
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

    private toUserEntity(user: Users): UserEntity {
        return new UserEntity({
            id: user.id,
            username: user.username,
            email: user.email,
            jwtId: user.jwt_id,
            familyId: user.family_id,
            familyRole: user.family_role,
            password: user.password,
            mfaEnabled: user.mfa_enabled,
        });
    }
}
