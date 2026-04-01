import {ConflictException, Injectable, Logger, UnauthorizedException} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import crypto from "crypto";
import argon2 from "argon2";
import {Users} from "../../../prisma/generated/client";
import {UserEntity} from "../users/user/models/entities/user.entity";
import {LoginUserEntity} from "../users/user/models/entities/login-user.entity";
import {InstanceConfigService} from "../helper/instance-config.service";
import {PrismaService} from "../helper/prisma.service";

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

        const existingOwner = await this.prismaService.config.findUnique({
            where: {key: "INSTANCE_OWNER" as any},
        });
        if (!existingOwner) {
            await this.prismaService.config.create({
                data: {key: "INSTANCE_OWNER" as any, value: user.id},
            });
        }

        const userEntity: UserEntity = this.toUserEntity(user);
        return new LoginUserEntity({
            user: userEntity,
            token: await this.generateToken(userEntity),
        });
    }

    async login(email: string, password: string): Promise<LoginUserEntity> {
        const user = await this.prismaService.users.findFirst({
            where: {email},
        });
        if (!user) throw new UnauthorizedException("Invalid email or password");

        const valid = await argon2.verify(user.password, password);
        if (!valid) throw new UnauthorizedException("Invalid email or password");

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
        });
    }
}
