import {IsNotEmpty, IsObject, IsString} from "class-validator";
import type {AuthenticationResponseJSON} from "@simplewebauthn/server";

export class MfaPasskeyDeleteDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    @IsObject()
    @IsNotEmpty()
    passkeyResponse: AuthenticationResponseJSON;
}
