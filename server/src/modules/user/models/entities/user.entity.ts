import {Exclude} from "class-transformer";

export class UserEntity {
    id: string;
    jwt_id: string;
    username: string;
    email: string;
    @Exclude()
    password: string;

    constructor(partial: Partial<UserEntity>) {
        Object.assign(this, partial);
    }
}
