import {UserEntity} from "./user.entity";

export class LoginUserEntity {
    user: UserEntity;
    token: string;

    constructor(loginUserEntity: Partial<LoginUserEntity>) {
        Object.assign(this, loginUserEntity);
    }
}
