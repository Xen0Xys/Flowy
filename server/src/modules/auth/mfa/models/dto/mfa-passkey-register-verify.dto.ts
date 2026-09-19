import {IsNotEmpty, IsObject, IsString, Length} from "class-validator";
import type {RegistrationResponseJSON} from "@simplewebauthn/server";

export class MfaPasskeyRegisterVerifyDto {
    @IsObject()
    response: RegistrationResponseJSON;

    @IsString()
    @IsNotEmpty()
    @Length(1, 50)
    label: string;
}
