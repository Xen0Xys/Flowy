import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from "@nestjs/common";
import {FastifyRequest} from "fastify";
import {UserEntity} from "../../modules/user/models/entities/user.entity";
import {UserRoles} from "../../../prisma/generated/enums";

interface RequestWithUser extends FastifyRequest {
    user?: UserEntity;
}

@Injectable()
export class FamilyAdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<RequestWithUser>();
        const user = request.user;

        if (!user) throw new ForbiddenException("Authentication required");

        if (!user.family_id)
            throw new ForbiddenException(
                "User is not associated with a family",
            );

        if (user.family_role !== UserRoles.ADMIN)
            throw new ForbiddenException("User must be a family admin");

        return true;
    }
}
