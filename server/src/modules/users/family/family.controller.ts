import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    UseGuards,
} from "@nestjs/common";
import {FamilyInviteCodeEntity} from "./models/entities/family-invite-code.entity";
import {FamilyInviteEntity} from "./models/entities/family-invite.entity";
import {FamilyAdminGuard} from "../../../common/guards/family-admin.guard";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {ApiBearerAuth} from "@nestjs/swagger";
import {CreateFamilyDto} from "./models/dto/create-family.dto";
import {InviteMemberDto} from "./models/dto/invite-member.dto";
import {UpdateFamilyDto} from "./models/dto/update-family.dto";
import {UserEntity} from "../user/models/entities/user.entity";
import {FamilyEntity} from "./models/entities/family.entity";
import {User} from "../../../common/decorators/user.decorator";
import {FamilyService} from "./family.service";

@Controller("family")
export class FamilyController {
    constructor(private readonly familyService: FamilyService) {}

    @Post("create")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async createFamily(@User() user: UserEntity, @Body() body: CreateFamilyDto): Promise<FamilyEntity> {
        const {name, currency} = body;
        return await this.familyService.createFamily(name, currency, user);
    }

    @Post("invite")
    @UseGuards(JwtAuthGuard, FamilyAdminGuard)
    @ApiBearerAuth()
    async inviteMember(@User() user: UserEntity, @Body() body: InviteMemberDto): Promise<FamilyInviteCodeEntity> {
        const {email} = body;
        return await this.familyService.inviteMember(user, email);
    }

    @Get("invites")
    @UseGuards(JwtAuthGuard, FamilyAdminGuard)
    @ApiBearerAuth()
    async getInvites(@User() user: UserEntity): Promise<FamilyInviteEntity[]> {
        return await this.familyService.getInvites(user.familyId);
    }

    @Delete("invites/:code")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard, FamilyAdminGuard)
    @ApiBearerAuth()
    async revokeInvite(@User() user: UserEntity, @Param("code") code: string): Promise<void> {
        return await this.familyService.deleteInvite(user, code);
    }

    @Post("join/:code")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async joinFamily(@User() user: UserEntity, @Param("code") code: string): Promise<void> {
        return await this.familyService.joinFamily(user, code);
    }

    @Delete("quit")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async quitFamily(@User() user: UserEntity): Promise<void> {
        return await this.familyService.quitFamily(user);
    }

    @Patch("settings")
    @UseGuards(JwtAuthGuard, FamilyAdminGuard)
    @ApiBearerAuth()
    async updateFamilySettings(@User() user: UserEntity, @Body() body: UpdateFamilyDto): Promise<FamilyEntity> {
        return await this.familyService.updateFamilySettings(user, body);
    }

    @Get("family")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getFamilyInfo(@User() user: UserEntity): Promise<FamilyEntity> {
        return await this.familyService.getFamilyInfo(user.familyId);
    }

    @Delete("members/:id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard, FamilyAdminGuard)
    @ApiBearerAuth()
    async removeMember(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
    ): Promise<void> {
        return await this.familyService.removeMember(user, id);
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard, FamilyAdminGuard)
    @ApiBearerAuth()
    async deleteFamily(@User() user: UserEntity): Promise<void> {
        return await this.familyService.deleteFamily(user);
    }
}
