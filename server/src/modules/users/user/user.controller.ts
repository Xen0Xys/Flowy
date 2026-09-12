import {Body, Controller, Delete, Get, HttpCode, Patch, UseGuards} from "@nestjs/common";
import {Throttle} from "@nestjs/throttler";
import {UpdatePasswordDto} from "./models/dto/update-password.dto";
import {UpdateUsernameDto} from "./models/dto/update-username.dto";
import {DeleteAccountDto} from "./models/dto/delete-account.dto";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {UpdateEmailDto} from "./models/dto/update-email.dto";
import {User} from "../../../common/decorators/user.decorator";
import {UserEntity} from "./models/entities/user.entity";
import {LoginUserEntity} from "./models/entities/login-user.entity";
import {UserService} from "./user.service";
import {ApiBearerAuth} from "@nestjs/swagger";

@Controller("user")
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Get("me")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async me(@User() user: UserEntity): Promise<UserEntity> {
        return user;
    }

    @Patch("me/username")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async updateMe(@User() user: UserEntity, @Body() body: UpdateUsernameDto): Promise<UserEntity> {
        return this.userService.updateUsername(user, body.username);
    }

    @Patch("me/email")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    @ApiBearerAuth()
    async updateEmail(@User() user: UserEntity, @Body() body: UpdateEmailDto): Promise<UserEntity> {
        return this.userService.updateEmail(user, body.email, body.currentPassword);
    }

    @Patch("me/password")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    @ApiBearerAuth()
    async updatePassword(@User() user: UserEntity, @Body() body: UpdatePasswordDto): Promise<LoginUserEntity> {
        return this.userService.changePassword(user, body.currentPassword, body.newPassword);
    }

    @Delete("me")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    @ApiBearerAuth()
    @HttpCode(204)
    async deleteAccount(@User() user: UserEntity, @Body() body: DeleteAccountDto): Promise<void> {
        await this.userService.deleteOwnAccount(user, body.currentPassword);
    }
}
