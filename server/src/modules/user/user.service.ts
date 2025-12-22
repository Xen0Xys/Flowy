import {ConflictException, Injectable} from "@nestjs/common";
import {UserRoles} from "../../../prisma/generated/enums";
import {UserEntity} from "./models/entities/user.entity";
import {PrismaService} from "../helper/prisma.service";
import {Users} from "../../../prisma/generated/client";
import crypto from "crypto";

@Injectable()
export class UserService {
    constructor(private readonly prismaService: PrismaService) {}

    async register(
        username: string,
        email: string,
        password: string,
    ): Promise<UserEntity> {
        // Check if first user
        const userCount: number = await this.prismaService.users.count();
        // If self-hosted, there are only one admin user allowed
        if (userCount > 0)
            throw new ConflictException(
                "There are already an admin registered in the instance",
            );
        const existingUser: Users | null =
            await this.prismaService.users.findFirst({
                where: {
                    email,
                },
            });
        if (existingUser)
            throw new ConflictException("Username or email already exists");
        // Create new family
        const family = await this.prismaService.family.create({
            data: {
                name: `${username}'s Family`,
            },
        });
        if (!family) {
            throw new ConflictException("Failed to create family");
        }
        // Create user
        const user = await this.prismaService.users.create({
            data: {
                username,
                email,
                password,
                role: UserRoles.ADMIN, // User that register is always their family's admin
                jwt_id: crypto.randomBytes(16).toString("hex"),
                family_id: family.id,
            },
        });

        return new UserEntity(user);
    }
}
