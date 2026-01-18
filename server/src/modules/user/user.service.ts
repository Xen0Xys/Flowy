import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import {UserEntity} from "./models/entities/user.entity";
import {PrismaService} from "../helper/prisma.service";
import {Users} from "../../../prisma/generated/client";
import crypto from "crypto";
import {InstanceConfigService} from "../helper/instance-config.service";
import {JwtService} from "@nestjs/jwt";
import {LoginUserEntity} from "./models/entities/login-user.entity";

@Injectable()
export class UserService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly instanceConfigService: InstanceConfigService,
        private readonly jwtService: JwtService,
    ) {}

    async generateToken(user: UserEntity): Promise<string> {
        // Generate JWT
        const payload = {sub: user.id};
        return this.jwtService.signAsync(payload, {
            jwtid: user.jwt_id,
        });
    }

    async register(
        username: string,
        email: string,
        password: string,
    ): Promise<LoginUserEntity> {
        // Check if registration is allowed
        if (!(await this.instanceConfigService.registrationAllowed()))
            throw new UnauthorizedException(
                "Registration is disabled on this instance",
            );
        const existingUser: Users | null =
            await this.prismaService.users.findFirst({
                where: {
                    email,
                },
            });
        if (existingUser)
            throw new ConflictException("Username or email already exists");
        // Create user
        const user = await this.prismaService.users.create({
            data: {
                username,
                email,
                password,
                jwt_id: crypto.randomBytes(16).toString("hex"),
            },
        });

        const userEntity = new UserEntity(user);
        return new LoginUserEntity({
            user: userEntity,
            token: await this.generateToken(userEntity),
        });
    }
    async login(email: string, password: string): Promise<LoginUserEntity> {
        const user = await this.prismaService.users.findFirst({
            where: {email, password},
        });
        if (!user) throw new UnauthorizedException("Invalid email or password");

        const userEntity = new UserEntity(user);
        return new LoginUserEntity({
            user: userEntity,
            token: await this.generateToken(userEntity),
        });
    }
}
