import {ConflictException, Injectable, Logger, UnauthorizedException} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import crypto from "crypto";
import argon2 from "argon2";
import {Users} from "../../../prisma/generated/client";
import {ConfigKey} from "../../../prisma/generated/enums";
import {UserEntity} from "../users/user/models/entities/user.entity";
import {LoginUserEntity} from "../users/user/models/entities/login-user.entity";
import {MfaChallengeEntity} from "./mfa/models/entities/mfa-challenge.entity";
import {MfaChallengeService} from "./mfa/mfa-challenge.service";
import {InstanceConfigService} from "../helper/instance-config.service";
import {PrismaService} from "../helper/prisma.service";

export type LoginResponse = LoginUserEntity | MfaChallengeEntity;

@Injectable()
export class AuthService {
    private readonly logger: Logger = new Logger(AuthService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly instanceConfigService: InstanceConfigService,
        private readonly jwtService: JwtService,
        private readonly mfaChallengeService: MfaChallengeService,
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
            where: {key: ConfigKey.INSTANCE_OWNER},
            update: {},
            create: {key: ConfigKey.INSTANCE_OWNER, value: user.id},
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
            const methods = await this.mfaChallengeService.getEnrolledMethods(user.id);
            const challengeToken = await this.mfaChallengeService.generateChallengeToken(user.id);
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

    private toUserEntity(user: Users): UserEntity {
        return new UserEntity({
            id: user.id,
            username: user.username,
            email: user.email,
            jwtId: user.jwt_id,
            familyId: user.family_id,
            familyRole: user.family_role,
            password: user.password,
            hasPassword: !!user.password,
            mfaEnabled: user.mfa_enabled,
        });
    }
}
