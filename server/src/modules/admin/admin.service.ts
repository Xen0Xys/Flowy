import {
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import {InstanceSettingsEntity} from "./models/entities/instance-settings.entity";
import {ConfigKey, UserRoles} from "../../../prisma/generated/enums";
import {PrismaService} from "../helper/prisma.service";
import argon2 from "argon2";

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
            where: {key: ConfigKey.REGISTRATION_ENABLED},
            create: {key: ConfigKey.REGISTRATION_ENABLED, value: val},
            update: {value: val},
        });
    }

    async deleteUser(id: string, currentUserId: string) {
        if (id === currentUserId)
            throw new UnauthorizedException("Cannot delete yourself");

        const user = await this.prisma.users.findUnique({where: {id}});
        if (!user) throw new NotFoundException("User not found");

        await this.prisma.$transaction(async (tx) => {
            if (user.family_id && user.family_role === UserRoles.ADMIN) {
                const remainingMembers = await tx.users.findMany({
                    where: {
                        family_id: user.family_id,
                        id: {not: user.id},
                    },
                    select: {id: true},
                    orderBy: {created_at: "asc"},
                });

                if (remainingMembers.length === 0) {
                    await tx.familyInvites.deleteMany({
                        where: {family_id: user.family_id},
                    });
                    await tx.users.updateMany({
                        where: {family_id: user.family_id},
                        data: {family_id: null, family_role: null},
                    });
                    await tx.family.delete({where: {id: user.family_id}});
                } else {
                    await tx.users.update({
                        where: {id: remainingMembers[0].id},
                        data: {family_role: UserRoles.ADMIN},
                    });
                }
            }

            await tx.users.delete({where: {id: user.id}});
        });
    }

    async updateInstanceOwner(newOwnerId: string): Promise<void> {
        const user = await this.prisma.users.findUnique({
            where: {id: newOwnerId},
        });
        if (!user) throw new NotFoundException("User not found");
        await this.prisma.config.upsert({
            where: {key: ConfigKey.INSTANCE_OWNER},
            create: {key: ConfigKey.INSTANCE_OWNER, value: newOwnerId},
            update: {value: newOwnerId},
        });
    }

    async adminUpdateUserPassword(id: string, password: string): Promise<void> {
        const user = await this.prisma.users.findUnique({where: {id}});
        if (!user) throw new NotFoundException("User not found");
        const hashed: string = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16, // 64 MiB
            timeCost: 4,
            parallelism: 2,
        });
        await this.prisma.users.update({where: {id}, data: {password: hashed}});
    }
}
