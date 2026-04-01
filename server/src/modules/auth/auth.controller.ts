import {Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Res, UseGuards} from "@nestjs/common";
import {ApiBearerAuth} from "@nestjs/swagger";
import {User} from "../../common/decorators/user.decorator";
import {JwtAuthGuard} from "../../common/guards/jwt-auth.guard";
import {LoginDto} from "../users/user/models/dto/login.dto";
import {RegisterDto} from "../users/user/models/dto/register.dto";
import {LoginUserEntity} from "../users/user/models/entities/login-user.entity";
import {UserEntity} from "../users/user/models/entities/user.entity";
import {AuthService} from "./auth.service";
import type {FastifyReply} from "fastify";

@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Get("csrf")
    async getCsrfToken(@Res({passthrough: true}) reply: FastifyReply): Promise<{csrfToken: string}> {
        const token: string = reply.generateCsrf();
        return {
            csrfToken: token,
        };
    }

    @Post("register")
    async register(@Body() body: RegisterDto): Promise<LoginUserEntity> {
        const {username, email, password} = body;
        return this.authService.register(username, email, password);
    }

    @Post("login")
    async login(@Body() body: LoginDto): Promise<LoginUserEntity> {
        const {email, password} = body;
        return this.authService.login(email, password);
    }

    @Delete("logout/all")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.NO_CONTENT)
    async invalidateTokens(@User() user: UserEntity): Promise<void> {
        await this.authService.invalidateTokens(user);
    }
}
