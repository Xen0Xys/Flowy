import {
    ConflictException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import {UserEntity} from "./models/entities/user.entity";
import {LoginUserEntity} from "./models/entities/login-user.entity";
import {PrismaService} from "../../helper/prisma.service";
import {Users} from "../../../../prisma/generated/client";
import {AuthService} from "../../auth/auth.service";
import argon2 from "argon2";

@Injectable()
export class UserService {
    private readonly logger: Logger = new Logger(UserService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly authService: AuthService,
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

    // shared password confirmation gate; call before any sensitive mutation
    async verifyPassword(user: UserEntity, currentPassword: string): Promise<void> {
        const db = await this.prismaService.users.findUnique({
            where: {id: user.id},
        });
        if (!db) throw new NotFoundException("User not found");

        const valid = await argon2.verify(db.password, currentPassword).catch(() => false);
        if (!valid) throw new ForbiddenException("Invalid current password");
    }

    // allow a user to delete their own account by confirming current password
    async deleteOwnAccount(user: UserEntity, currentPassword: string): Promise<void> {
        await this.verifyPassword(user, currentPassword);

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
            this.logger.log(`actor=${user.id} action=user.deleteOwnAccount`);
        } catch (e) {
            this.logger.error("Failed to delete user account", e as any);
            throw new InternalServerErrorException("Unable to delete account");
        }
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

    async updateEmail(user: UserEntity, newEmail: string, currentPassword: string): Promise<UserEntity> {
        await this.verifyPassword(user, currentPassword);
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

    // public API: change password with current password verification.
    // Rotates jwt_id (invalidating every previously issued token) and returns a
    // freshly signed token so the caller stays logged in without re-authenticating.
    async changePassword(user: UserEntity, oldPassword: string, newPassword: string): Promise<LoginUserEntity> {
        await this.verifyPassword(user, oldPassword);
        const updated = await this.persistPassword(user.id, newPassword);
        await this.authService.invalidateTokens(updated);
        const refreshed = await this.prismaService.users.findUniqueOrThrow({where: {id: updated.id}});
        const refreshedEntity = UserService.toUserEntity(refreshed);
        const token = await this.authService.generateToken(refreshedEntity);
        this.logger.log(`Password changed by user ${user.id}`);
        return new LoginUserEntity({user: refreshedEntity, token});
    }

    // public API: set password without old password (used by admin/owner flows).
    // Rotates jwt_id on the target so previously issued tokens are invalidated;
    // the acting admin's session is not affected.
    async updatePassword(userId: string, newPassword: string): Promise<UserEntity> {
        const user = await this.prismaService.users.findUnique({
            where: {id: userId},
        });
        if (!user) throw new NotFoundException("User not found");
        const updated = await this.persistPassword(userId, newPassword);
        await this.authService.invalidateTokens(updated);
        this.logger.log(`Password reset for user ${userId}`);
        return updated;
    }

    async listUsers(): Promise<UserEntity[]> {
        const users = await this.prismaService.users.findMany();
        return users.map((u) => UserService.toUserEntity(u));
    }

    // internal helper: hash + persist new password. jwt_id rotation is the
    // responsibility of the public callers.
    private async persistPassword(userId: string, password: string): Promise<UserEntity> {
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
        const updated = await this.prismaService.users.update({
            where: {id: userId},
            data: {
                password: hashed,
            },
        });
        return UserService.toUserEntity(updated);
    }
}
