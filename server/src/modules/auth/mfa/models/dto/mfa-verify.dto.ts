import {IsNotEmpty, IsString, Length} from "class-validator";

export class MfaVerifyDto {
    @IsString()
    @IsNotEmpty()
    challengeToken: string;

    @IsString()
    @IsNotEmpty()
    @Length(1, 32)
    code: string;
}
