import {UserEntity} from "../../modules/users/user/models/entities/user.entity";
import {createParamDecorator, ExecutionContext} from "@nestjs/common";

export const User = createParamDecorator(
    (_: unknown, ctx: ExecutionContext): UserEntity | undefined => {
        const request = ctx.switchToHttp().getRequest<{user?: UserEntity}>();
        return request.user;
    },
);
