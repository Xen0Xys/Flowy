import {
    ConflictException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import {InstanceConfigService} from "../../helper/instance-config.service";
import {LoginUserEntity} from "./models/entities/login-user.entity";
import {UserEntity} from "./models/entities/user.entity";
import {PrismaService} from "../../helper/prisma.service";
import {Users} from "../../../../prisma/generated/client";
import {JwtService} from "@nestjs/jwt";
import crypto from "crypto";
import argon2 from "argon2";

@Injectable()
export class UserService {
    private readonly logger: Logger = new Logger("UserService");

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

    // allow a user to delete their own account by confirming current password
    async deleteOwnAccount(user: UserEntity, currentPassword: string): Promise<void> {
        const db = await this.prismaService.users.findUnique({
            where: {id: user.id},
        });
        if (!db) throw new NotFoundException("User not found");

        const valid = await argon2.verify(db.password, currentPassword).catch(() => false);
        if (!valid) throw new ForbiddenException("Invalid current password");

        const logger = new Logger(UserService.name);

        try {
            // execute cleanup steps inside a single transaction
            await this.prismaService.$transaction([
                // explicitly remove user settings (schema already has cascade but be explicit)
                this.prismaService.userSettings.deleteMany({
                    where: {user_id: user.id},
                }),
                // remove instance owner config if set to this user
                this.prismaService.config.deleteMany({
                    where: {key: "INSTANCE_OWNER" as any, value: user.id},
                }),
                // finally delete the user
                this.prismaService.users.delete({where: {id: user.id}}),
            ]);
        } catch (e) {
            logger.error("Failed to delete user account", e as any);
            throw new InternalServerErrorException("Unable to delete account");
        }
    }

    async generateToken(user: UserEntity): Promise<string> {
        const payload = {sub: user.id};
        return this.jwtService.signAsync(payload, {
            jwtid: user.jwtId,
        });
    }

    async register(username: string, email: string, password: string): Promise<LoginUserEntity> {
        if (!(await this.instanceConfigService.registrationAllowed()))
            throw new UnauthorizedException("Registration is disabled on this instance");
        const existingUser: Users | null = await this.prismaService.users.findFirst({
            where: {
                email,
            },
        });
        if (existingUser) throw new ConflictException("Username or email already exists");

        // Improve performances for development environment, but keep strong hashing for production
        let hashed: string;
        if (process.env.NODE_ENV !== "production") {
            hashed = await argon2.hash(password, {
                type: argon2.argon2id,
                memoryCost: 2 ** 16, // 64 MiB
                timeCost: 2,
                parallelism: 4,
            });
            this.logger.warn("Using weaker password hashing parameters in non-production environment");
        } else {
            hashed = await argon2.hash(password, {
                type: argon2.argon2id,
                memoryCost: 2 ** 18, // 128 MiB
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
        if (!valid) throw new UnauthorizedException("Invalid email or password");

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

    async updateUsername(user: UserEntity, newUsername: string): Promise<UserEntity> {
        // ensure username not used by another user
        const existing = await this.prismaService.users.findFirst({
            where: {username: newUsername},
        });
        if (existing && existing.id !== user.id) throw new ConflictException("Username or email already exists");
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
        if (existing) throw new ConflictException("Username or email already exists");
        const updated = await this.prismaService.users.update({
            where: {id: user.id},
            data: {email: newEmail},
        });
        return UserService.toUserEntity(updated);
    }

    // public API: change password with current password verification
    async changePassword(user: UserEntity, oldPassword: string, newPassword: string): Promise<UserEntity> {
        const db = await this.prismaService.users.findUnique({
            where: {id: user.id},
        });
        if (!db) throw new NotFoundException("User not found");
        const valid = await argon2.verify(db.password, oldPassword).catch(() => false);
        if (!valid) throw new ForbiddenException("Invalid current password");
        return this.persistPassword(user.id, newPassword);
    }

    // public API: set password without old password (used by admin/owner flows)
    async updatePassword(userId: string, newPassword: string): Promise<UserEntity> {
        const user = await this.prismaService.users.findUnique({
            where: {id: userId},
        });
        if (!user) throw new NotFoundException("User not found");
        return this.persistPassword(userId, newPassword);
    }

    async listUsers(): Promise<UserEntity[]> {
        const users = await this.prismaService.users.findMany();
        return users.map((u) => UserService.toUserEntity(u));
    }

    async invalidateTokens(user: UserEntity): Promise<void> {
        await this.prismaService.users.update({
            where: {id: user.id},
            data: {
                jwt_id: crypto.randomBytes(16).toString("hex"),
            },
        });
    }

    // internal helper: hash + persist new password (do NOT rotate jwt_id)
    private async persistPassword(userId: string, password: string): Promise<UserEntity> {
        const hashed = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 2 ** 18, // 128 MiB
            timeCost: 10,
            parallelism: 4,
        });
        const updated = await this.prismaService.users.update({
            where: {id: userId},
            data: {
                password: hashed,
            },
        });
        return UserService.toUserEntity(updated);
    }
}
