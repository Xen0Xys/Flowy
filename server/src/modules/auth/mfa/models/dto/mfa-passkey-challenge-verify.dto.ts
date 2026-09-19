import {IsNotEmpty, IsObject, IsString} from "class-validator";
import type {AuthenticationResponseJSON} from "@simplewebauthn/server";

export class MfaPasskeyChallengeVerifyDto {
    @IsString()
    @IsNotEmpty()
    challengeToken: string;

    @IsObject()
    response: AuthenticationResponseJSON;
}
