import {IsNotEmpty, IsString} from "class-validator";

export class MfaPasskeyRegisterOptionsDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;
}
