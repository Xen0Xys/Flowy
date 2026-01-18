import {Exclude} from "class-transformer";
import {UserRoles} from "../../../../../prisma/generated/enums";

export class UserEntity {
    id: string;
    username: string;
    email: string;
    jwt_id: string;
    family_id: string | null;
    family_role: UserRoles | null;
    @Exclude()
    password: string;

    constructor(partial: Partial<UserEntity>) {
        Object.assign(this, partial);
    }
}
