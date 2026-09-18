import {IsNotEmpty, IsString} from "class-validator";

export class MfaVerifyDto {
    @IsString()
    @IsNotEmpty()
    challengeToken: string;

    @IsString()
    @IsNotEmpty()
    code: string;
}
