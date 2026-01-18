import {UserService} from "./user.service";
import {Body, Controller, Post} from "@nestjs/common";
import {RegisterDto} from "./models/dto/register.dto";
import {LoginUserEntity} from "./models/entities/login-user.entity";
import {LoginDto} from "./models/dto/login.dto";

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
}
