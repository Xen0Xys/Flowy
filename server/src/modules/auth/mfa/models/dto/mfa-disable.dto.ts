import {IsNotEmpty, IsString} from "class-validator";

export class MfaDisableDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    @IsString()
    @IsNotEmpty()
    code: string;
}
