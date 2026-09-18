import {IsNotEmpty, IsString} from "class-validator";

export class MfaPasskeyDeleteDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;
}
