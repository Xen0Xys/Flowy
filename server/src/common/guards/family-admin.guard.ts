import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from "@nestjs/common";
import {UserEntity} from "../../modules/user/models/entities/user.entity";
import {UserRoles} from "../../../prisma/generated/enums";
import {AuthenticatedRequest} from "./jwt-auth.guard";

@Injectable()
export class FamilyAdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request: AuthenticatedRequest = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const user: UserEntity | undefined = request.user;

        if (!user) throw new ForbiddenException("Authentication required");

        if (!user.familyId)
            throw new ForbiddenException(
                "User is not associated with a family",
            );

        if (user.familyRole !== UserRoles.ADMIN)
            throw new ForbiddenException("User must be a family admin");

        return true;
    }
}
