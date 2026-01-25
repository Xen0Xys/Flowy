import {Exclude} from "class-transformer";
import {UserRoles} from "../../../../../prisma/generated/enums";

export class UserEntity {
    id: string;
    username: string;
    email: string;
    @Exclude()
    jwtId: string;
    familyId: string | null;
    familyRole: UserRoles | null;
    @Exclude()
    password: string;

    constructor(partial: Partial<UserEntity>) {
        Object.assign(this, partial);
    }
}
