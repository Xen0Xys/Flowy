import {PrismaService} from "../helper/prisma.service";
import {
    ConflictException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import {UserService} from "../user/user.service";
import {UserEntity} from "../user/models/entities/user.entity";
import {UserRoles} from "../../../prisma/generated/enums";
import {FamilyEntity} from "./models/entities/family.entity";
import {FamilyInviteCodeEntity} from "./models/entities/family-invite-code.entity";
import {FamilyInviteEntity} from "./models/entities/family-invite.entity";

@Injectable()
export class FamilyService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly userService: UserService,
    ) {}

    async createFamily(name: string, currency: string, owner: UserEntity) {
        // Check if owner is already in a family
        if (owner.family_id)
            throw new ConflictException("User is already in a family");

        // Create family
        const family = await this.prismaService.family.create({
            data: {
                name,
                currency,
            },
        });

        // Update user to be in the new family
        await this.prismaService.users.update({
            where: {id: owner.id},
            data: {
                family_id: family.id,
                family_role: UserRoles.ADMIN,
            },
        });
        owner.family_id = family.id;
        owner.family_role = UserRoles.ADMIN;

        // Return family entity
        return new FamilyEntity({
            name: family.name,
            currency: family.currency,
            owner: owner,
        });
    }

    async inviteMember(
        user: UserEntity,
        email: string,
    ): Promise<FamilyInviteCodeEntity> {
        if (!user.family_id)
            throw new NotFoundException("User is not in a family");
        // Check if family exists
        const family = await this.prismaService.family.findUnique({
            where: {id: user.family_id},
        });
        if (!family) throw new NotFoundException("Family does not exist");

        // Do not check if email exists
        // Create invite code
        const inviteCode = Math.random().toString(36).substring(2, 15);

        // Store invite code in database
        await this.prismaService.familyInvites.create({
            data: {
                code: inviteCode,
                family_id: user.family_id,
                email,
                expires_at: new Date(
                    new Date().setDate(new Date().getDate() + 7),
                ), // Expires in 7 days
            },
        });
        return new FamilyInviteCodeEntity({
            code: inviteCode,
        });
    }

    async getInvites(family_id: string | null) {
        if (!family_id) throw new NotFoundException("User is not in a family");
        // Check if family exists
        const family = await this.prismaService.family.findUnique({
            where: {id: family_id},
        });
        if (!family) throw new NotFoundException("Family does not exist");

        // Get invites
        const invites = await this.prismaService.familyInvites.findMany({
            where: {family_id},
        });
        return invites.map(
            (invite) =>
                new FamilyInviteEntity({
                    code: invite.code,
                    email: invite.email,
                }),
        );
    }

    async deleteInvite(user: UserEntity, invite_id: string) {
        // Check if invite exists
        const invite = await this.prismaService.familyInvites.findUnique({
            where: {code: invite_id},
        });
        if (!invite) throw new NotFoundException("Invite does not exist");

        // Check if user is admin of the family
        if (
            user.family_id !== invite.family_id ||
            user.family_role !== UserRoles.ADMIN
        )
            throw new UnauthorizedException("User is not admin of the family");

        // Delete invite
        await this.prismaService.familyInvites.delete({
            where: {code: invite_id},
        });
    }

    async joinFamily(user: UserEntity, code: string) {
        // Check if user is already in a family
        if (user.family_id)
            throw new ConflictException("User is already in a family");

        // Check if code exists
        const invite = await this.prismaService.familyInvites.findUnique({
            where: {code},
        });
        if (!invite) throw new NotFoundException("Invite code does not exist");

        // Check if code is for the user's email
        if (invite.email !== user.email)
            throw new UnauthorizedException("Invite code is not for this user");

        // Update user to be in the family
        await this.prismaService.users.update({
            where: {id: user.id},
            data: {
                family_id: invite.family_id,
                family_role: UserRoles.USER,
            },
        });

        // Delete invite
        await this.prismaService.familyInvites.delete({
            where: {code},
        });
    }

    async quitFamily(user: UserEntity) {
        // Check if user is in a family
        if (!user.family_id)
            throw new NotFoundException("User is not in a family");

        // Update user to remove family
        await this.prismaService.users.update({
            where: {id: user.id},
            data: {
                family_id: null,
                family_role: null,
            },
        });
    }

    async updateFamilySettings(
        user: UserEntity,
        body: {name?: string; currency?: string},
    ) {
        if (!user.family_id)
            throw new NotFoundException("User is not in a family");
        const family = await this.prismaService.family.findUnique({
            where: {id: user.family_id},
        });
        if (!family) throw new NotFoundException("Family does not exist");

        // Only family admin can update
        if (user.family_role !== UserRoles.ADMIN)
            throw new UnauthorizedException("User must be a family admin");

        const data: any = {};
        if (body.name) data.name = body.name;
        if (body.currency) data.currency = body.currency;

        const updated = await this.prismaService.family.update({
            where: {id: user.family_id},
            data,
        });

        return new FamilyEntity({
            name: updated.name,
            currency: updated.currency,
            owner: user,
        });
    }
}
