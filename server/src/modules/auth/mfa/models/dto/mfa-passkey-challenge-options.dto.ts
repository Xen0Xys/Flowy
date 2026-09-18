import {IsNotEmpty, IsString} from "class-validator";

export class MfaPasskeyChallengeOptionsDto {
    @IsString()
    @IsNotEmpty()
    challengeToken: string;
}
