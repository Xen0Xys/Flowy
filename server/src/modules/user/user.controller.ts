import {Body, Controller, Get, Post, UseGuards} from "@nestjs/common";
import {LoginUserEntity} from "./models/entities/login-user.entity";
import {JwtAuthGuard} from "../../common/guards/jwt-auth.guard";
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
}
