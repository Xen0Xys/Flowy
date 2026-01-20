import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    UseGuards,
} from "@nestjs/common";
import {JwtAuthGuard} from "../../common/guards/jwt-auth.guard";
import {InstanceOwnerGuard} from "../../common/guards/instance-owner.guard";
import {PrismaService} from "../helper/prisma.service";
import {User} from "../../common/decorators/user.decorator";
import {UserEntity} from "../user/models/entities/user.entity";
import {RegistrationEnabledDto} from "./models/dto/registration-enabled.dto";
import {UpdateOwnerDto} from "./models/dto/update-owner.dto";
import {InstanceSettingsDto} from "./models/dto/instance-settings.dto";
import {AdminService} from "./admin.service";
import {SetPasswordDto} from "./models/dto/set-password.dto";

@Controller("admin")
export class AdminController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly adminService: AdminService,
    ) {}

    @Get("instance/settings")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    async getInstanceSettings(): Promise<InstanceSettingsDto> {
        return this.adminService.getInstanceSettings();
    }

    @Patch("instance/registration_enabled")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    async updateRegistrationEnabled(
        @User() user: UserEntity,
        @Body() body: RegistrationEnabledDto,
    ) {
        return this.adminService.updateRegistrationEnabled(
            body.registrationEnabled,
        );
    }

    @Get("users")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    async listUsers(): Promise<UserEntity[]> {
        return this.adminService.listUsers();
    }

    @Delete("users/:id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    async deleteUser(
        @Param("id") id: string,
        @User() user: UserEntity,
    ): Promise<void> {
        return this.adminService.deleteUser(id, user.id);
    }

    @Patch("instance/owner")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    async updateInstanceOwner(@Body() body: UpdateOwnerDto): Promise<void> {
        return this.adminService.updateInstanceOwner(body.ownerId);
    }

    @Patch("users/:id/password")
    @UseGuards(JwtAuthGuard, InstanceOwnerGuard)
    async adminUpdateUserPassword(
        @Param("id") id: string,
        @Body() body: SetPasswordDto,
    ) {
        return this.adminService.adminUpdateUserPassword(id, body.password);
    }
}
