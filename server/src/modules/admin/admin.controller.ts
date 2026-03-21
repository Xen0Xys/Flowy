import {Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards} from "@nestjs/common";
import {JwtAuthGuard} from "../../common/guards/jwt-auth.guard";
import {InstanceOwnerGuard} from "../../common/guards/instance-owner.guard";
import {ApiBearerAuth} from "@nestjs/swagger";
import {User} from "../../common/decorators/user.decorator";
import {UserEntity} from "../users/user/models/entities/user.entity";
import {RegistrationEnabledDto} from "./models/dto/registration-enabled.dto";
import {UpdateOwnerDto} from "./models/dto/update-owner.dto";
import {InstanceSettingsDto} from "./models/dto/instance-settings.dto";
import {AdminService} from "./admin.service";
import {SetPasswordDto} from "./models/dto/set-password.dto";
import {FamilyEntity} from "../users/family/models/entities/family.entity";
import {FamilyService} from "../users/family/family.service";
import {UserService} from "../users/user/user.service";
import {AccountService} from "../accounting/account/account.service";

@Controller("admin")
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly familyService: FamilyService,
        private readonly usersService: UserService,
        private readonly accountService: AccountService,
    ) {}

    @Get("instance/settings")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    @ApiBearerAuth()
    async getInstanceSettings(): Promise<InstanceSettingsDto> {
        return this.adminService.getInstanceSettings();
    }

    @Patch("instance/registration_enabled")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    @ApiBearerAuth()
    async updateRegistrationEnabled(@User() user: UserEntity, @Body() body: RegistrationEnabledDto) {
        return this.adminService.updateRegistrationEnabled(body.registrationEnabled);
    }

    @Get("users")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    @ApiBearerAuth()
    async listUsers(): Promise<UserEntity[]> {
        return this.usersService.listUsers();
    }

    @Get("family/:family_id")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    @ApiBearerAuth()
    async getFamily(@Param("family_id") familyId: string): Promise<FamilyEntity> {
        return this.familyService.getFamilyInfo(familyId);
    }

    @Delete("users/:id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    @ApiBearerAuth()
    async deleteUser(@Param("id") id: string, @User() user: UserEntity): Promise<void> {
        return this.adminService.deleteUser(id, user.id);
    }

    @Patch("instance/owner")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiBearerAuth()
    async updateInstanceOwner(@Body() body: UpdateOwnerDto): Promise<void> {
        return this.adminService.updateInstanceOwner(body.ownerId);
    }

    @Patch("users/:id/password")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    @ApiBearerAuth()
    async adminUpdateUserPassword(@Param("id") id: string, @Body() body: SetPasswordDto) {
        return this.adminService.adminUpdateUserPassword(id, body.password);
    }

    @Post("integrity/account")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    @ApiBearerAuth()
    async runAccountIntegrityCheck(): Promise<void> {
        await this.accountService.checkIntegrity();
    }
}
