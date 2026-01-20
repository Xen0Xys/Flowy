import {
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import {InstanceSettingsEntity} from "./models/entities/instance-settings.entity";
import {UserEntity} from "../user/models/entities/user.entity";
import {PrismaService} from "../helper/prisma.service";
import argon2 from "argon2";
import {ConfigKey} from "../../../prisma/generated/enums";

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) {}

    async getInstanceSettings(): Promise<InstanceSettingsEntity> {
        const configs = await this.prisma.config.findMany();
        const map: Record<string, string> = {};
        configs.forEach((c) => (map[c.key] = c.value));
        return new InstanceSettingsEntity({
            registrationEnabled: map[ConfigKey.REGISTRATION_ENABLED] === "true",
            instanceOwner: map[ConfigKey.INSTANCE_OWNER],
        });
    }

    async updateRegistrationEnabled(value: boolean): Promise<void> {
        const val = value ? "true" : "false";
        await this.prisma.config.upsert({
            where: {key: ConfigKey.REGISTRATION_ENABLED as any},
            create: {key: ConfigKey.REGISTRATION_ENABLED as any, value: val},
            update: {value: val},
        });
    }

    async listUsers(): Promise<UserEntity[]> {
        const users = await this.prisma.users.findMany();
        return users.map((u) => new UserEntity(u));
    }

    async deleteUser(id: string, currentUserId: string) {
        if (id === currentUserId)
            throw new UnauthorizedException("Cannot delete yourself");
        await this.prisma.users.delete({where: {id}});
    }

    async updateInstanceOwner(newOwnerId: string): Promise<void> {
        const user = await this.prisma.users.findUnique({
            where: {id: newOwnerId},
        });
        if (!user) throw new NotFoundException("User not found");
        await this.prisma.config.upsert({
            where: {key: ConfigKey.INSTANCE_OWNER as any},
            create: {key: ConfigKey.INSTANCE_OWNER as any, value: newOwnerId},
            update: {value: newOwnerId},
        });
    }

    async adminUpdateUserPassword(id: string, password: string): Promise<void> {
        const user = await this.prisma.users.findUnique({where: {id}});
        if (!user) throw new NotFoundException("User not found");
        const hashed: string = await argon2.hash(password);
        await this.prisma.users.update({where: {id}, data: {password: hashed}});
    }
}
