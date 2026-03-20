import {IsBoolean, IsNotEmpty} from "class-validator";

export class RegistrationEnabledDto {
    @IsNotEmpty()
    @IsBoolean()
    registrationEnabled: boolean;

    constructor(partial: Partial<RegistrationEnabledDto>) {
        Object.assign(this, partial);
    }
}
