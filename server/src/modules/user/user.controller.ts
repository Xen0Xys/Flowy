import {Body, Controller, Get, Patch, Post, UseGuards} from "@nestjs/common";
import {LoginUserEntity} from "./models/entities/login-user.entity";
import {UpdatePasswordDto} from "./models/dto/update-password.dto";
import {UpdateUsernameDto} from "./models/dto/update-username.dto";
import {JwtAuthGuard} from "../../common/guards/jwt-auth.guard";
import {UpdateEmailDto} from "./models/dto/update-email.dto";
import {User} from "../../common/decorators/user.decorator";
import {UserEntity} from "./models/entities/user.entity";
import {RegisterDto} from "./models/dto/register.dto";
import {LoginDto} from "./models/dto/login.dto";
import {UserService} from "./user.service";

@Controller("user")
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Post("register")
    async register(@Body() body: RegisterDto): Promise<LoginUserEntity> {
        const {username, email, password} = body;
        return this.userService.register(username, email, password);
    }

    @Post("login")
    async login(@Body() body: LoginDto): Promise<LoginUserEntity> {
        const {email, password} = body;
        return this.userService.login(email, password);
    }

    @Get("me")
    @UseGuards(JwtAuthGuard)
    async me(@User() user: UserEntity): Promise<UserEntity> {
        return user;
    }

    @Patch("me/username")
    @UseGuards(JwtAuthGuard)
    async updateMe(
        @User() user: UserEntity,
        @Body() body: UpdateUsernameDto,
    ): Promise<UserEntity> {
        return this.userService.updateUsername(user, body.username);
    }

    @Patch("me/email")
    @UseGuards(JwtAuthGuard)
    async updateEmail(
        @User() user: UserEntity,
        @Body() body: UpdateEmailDto,
    ): Promise<UserEntity> {
        return this.userService.updateEmail(user, body.email);
    }

    @Patch("me/password")
    @UseGuards(JwtAuthGuard)
    async updatePassword(
        @User() user: UserEntity,
        @Body() body: UpdatePasswordDto,
    ): Promise<UserEntity> {
        return this.userService.changePassword(
            user,
            body.old_password,
            body.password,
        );
    }
}
