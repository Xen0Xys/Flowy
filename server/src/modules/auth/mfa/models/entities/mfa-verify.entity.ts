import {LoginUserEntity} from "../../../../users/user/models/entities/login-user.entity";

export class MfaVerifyEntity extends LoginUserEntity {
    mfaAutoDisabled: boolean;

    constructor(partial: Partial<MfaVerifyEntity>) {
        super(partial);
        Object.assign(this, partial);
    }
}
