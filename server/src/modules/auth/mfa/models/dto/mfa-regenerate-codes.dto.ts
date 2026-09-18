import {IsNotEmpty, IsString} from "class-validator";

export class MfaRegenerateCodesDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    @IsString()
    @IsNotEmpty()
    code: string;
}
