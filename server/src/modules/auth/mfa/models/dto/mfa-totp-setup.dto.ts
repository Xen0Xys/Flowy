import {IsNotEmpty, IsString} from "class-validator";

export class MfaTotpSetupDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;
}
