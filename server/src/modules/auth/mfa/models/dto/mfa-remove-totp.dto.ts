import {IsNotEmpty, IsString, Length} from "class-validator";

export class MfaRemoveTotpDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    @IsString()
    @IsNotEmpty()
    @Length(1, 32)
    code: string;
}
