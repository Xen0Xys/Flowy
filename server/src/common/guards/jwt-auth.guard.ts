import {CanActivate, ExecutionContext, Injectable, UnauthorizedException,} from "@nestjs/common";
import {UserEntity} from "../../modules/users/user/models/entities/user.entity";
import {PrismaService} from "../../modules/helper/prisma.service";
import {FastifyRequest} from "fastify";
import {JwtService} from "@nestjs/jwt";
import {UserService} from "../../modules/users/user/user.service";

export interface AuthenticatedRequest extends FastifyRequest {
    user?: UserEntity;
}

interface JwtPayload {
    sub?: string;
    jti?: string;
    [key: string]: unknown;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly prismaService: PrismaService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const token = this.extractTokenFromHeader(request);

        if (!token)
            throw new UnauthorizedException("Authorization token is missing");

        try {
            const payload =
                await this.jwtService.verifyAsync<JwtPayload>(token);
            if (!payload?.sub)
                throw new UnauthorizedException("Invalid authentication token");

            const user = await this.prismaService.users.findUnique({
                where: {id: payload.sub},
            });

            if (!user)
                throw new UnauthorizedException("Invalid authentication token");

            if (payload.jti && payload.jti !== user.jwt_id)
                throw new UnauthorizedException("Invalid authentication token");

            request.user = UserService.toUserEntity(user);
            return true;
        } catch {
            throw new UnauthorizedException("Invalid or expired token");
        }
    }

    private extractTokenFromHeader(
        request: FastifyRequest,
    ): string | undefined {
        const authHeader = request.headers.authorization;
        if (!authHeader) return undefined;
        const [scheme, token] = authHeader.split(" ");
        if (scheme !== "Bearer" || !token) return undefined;
        return token;
    }
}
