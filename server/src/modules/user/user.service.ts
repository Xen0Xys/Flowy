import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import {InstanceConfigService} from "../helper/instance-config.service";
import {LoginUserEntity} from "./models/entities/login-user.entity";
import {UserEntity} from "./models/entities/user.entity";
import {PrismaService} from "../helper/prisma.service";
import {Users} from "../../../prisma/generated/client";
import {JwtService} from "@nestjs/jwt";
import crypto from "crypto";
import argon2 from "argon2";

@Injectable()
export class UserService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly instanceConfigService: InstanceConfigService,
        private readonly jwtService: JwtService,
    ) {}

    static toUserEntity(user: Users): UserEntity {
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

    async generateToken(user: UserEntity): Promise<string> {
        const payload = {sub: user.id};
        return this.jwtService.signAsync(payload, {
            jwtid: user.jwtId,
        });
    }

    async register(
        username: string,
        email: string,
        password: string,
    ): Promise<LoginUserEntity> {
        if (!(await this.instanceConfigService.registrationAllowed()))
            throw new UnauthorizedException(
                "Registration is disabled on this instance",
            );
        const existingUser: Users | null =
            await this.prismaService.users.findFirst({
                where: {
                    email,
                },
            });
        if (existingUser)
            throw new ConflictException("Username or email already exists");
        const hashed = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16, // 64 MiB
            timeCost: 4,
            parallelism: 2,
        });

        const user = await this.prismaService.users.create({
            data: {
                username,
                email,
                password: hashed,
                jwt_id: crypto.randomBytes(16).toString("hex"),
            },
        });

        // If no instance owner is set, set this user as the instance owner
        const existingOwner = await this.prismaService.config.findUnique({
            where: {key: "INSTANCE_OWNER" as any},
        });
        if (!existingOwner) {
            await this.prismaService.config.create({
                data: {key: "INSTANCE_OWNER" as any, value: user.id},
            });
        }

        const userEntity: UserEntity = UserService.toUserEntity(user);
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

        // verify password using argon2
        const valid = await argon2.verify(user.password, password);
        if (!valid)
            throw new UnauthorizedException("Invalid email or password");

        const userEntity: UserEntity = UserService.toUserEntity(user);
        return new LoginUserEntity({
            user: userEntity,
            token: await this.generateToken(userEntity),
        });
    }

    async getUserById(userId: string): Promise<UserEntity> {
        const user = await this.prismaService.users.findUnique({
            where: {id: userId},
        });
        if (!user) throw new NotFoundException("User not found");
        return UserService.toUserEntity(user);
    }

    async updateUsername(
        user: UserEntity,
        newUsername: string,
    ): Promise<UserEntity> {
        // ensure username not used by another user
        const existing = await this.prismaService.users.findFirst({
            where: {username: newUsername},
        });
        if (existing && existing.id !== user.id)
            throw new ConflictException("Username or email already exists");
        const updated = await this.prismaService.users.update({
            where: {id: user.id},
            data: {username: newUsername},
        });
        return UserService.toUserEntity(updated);
    }

    async updateEmail(user: UserEntity, newEmail: string): Promise<UserEntity> {
        const existing = await this.prismaService.users.findFirst({
            where: {email: newEmail},
        });
        if (existing)
            throw new ConflictException("Username or email already exists");
        const updated = await this.prismaService.users.update({
            where: {id: user.id},
            data: {email: newEmail},
        });
        return UserService.toUserEntity(updated);
    }

    // public API: change password with current password verification
    async changePassword(
        user: UserEntity,
        oldPassword: string,
        newPassword: string,
    ): Promise<UserEntity> {
        const db = await this.prismaService.users.findUnique({
            where: {id: user.id},
        });
        if (!db) throw new NotFoundException("User not found");
        const valid = await argon2
            .verify(db.password, oldPassword)
            .catch(() => false);
        if (!valid) throw new ForbiddenException("Invalid current password");
        return this.persistPassword(user.id, newPassword);
    }

    // public API: set password without old password (used by admin/owner flows)
    async updatePassword(
        user: UserEntity,
        dto: {password: string},
    ): Promise<UserEntity> {
        return this.persistPassword(user.id, dto.password);
    }

    // internal helper: hash + persist new password and rotate jwt_id
    private async persistPassword(
        userId: string,
        password: string,
    ): Promise<UserEntity> {
        const hashed = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,
            timeCost: 4,
            parallelism: 2,
        });
        const updated = await this.prismaService.users.update({
            where: {id: userId},
            data: {
                password: hashed,
                jwt_id: crypto.randomBytes(16).toString("hex"),
            },
        });
        return UserService.toUserEntity(updated);
    }
}
