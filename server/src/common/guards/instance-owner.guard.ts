import {CanActivate, ExecutionContext, Injectable, UnauthorizedException,} from "@nestjs/common";
import {UserEntity} from "../../modules/users/user/models/entities/user.entity";
import {PrismaService} from "../../modules/helper/prisma.service";
import {ConfigKey} from "../../../prisma/generated/enums";
import {AuthenticatedRequest} from "./jwt-auth.guard";

@Injectable()
export class InstanceOwnerGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request: AuthenticatedRequest = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const user: UserEntity | undefined = request.user;

        if (!user) throw new UnauthorizedException("Authentication required");

        // Check configured INSTANCE_OWNER in DB
        const instanceOwner = await this.prisma.config.findUnique({
            where: {key: ConfigKey.INSTANCE_OWNER as any},
        });
        const ownerId: string | null = instanceOwner?.value || null;
        if (!ownerId || ownerId !== user.id)
            throw new UnauthorizedException("Only instance owner can access");

        return true;
    }
}
