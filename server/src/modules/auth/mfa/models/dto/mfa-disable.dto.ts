import {IsNotEmpty, IsObject, IsOptional, IsString, Length} from "class-validator";
import type {AuthenticationResponseJSON} from "@simplewebauthn/server";
import {AtLeastOne} from "../../../../../common/validators/at-least-one.validator";

export class MfaDisableDto {
    @IsString()
    @IsNotEmpty()
    @AtLeastOne(["code", "passkeyResponse"], {
        message: "A verification code or a passkey response is required",
    })
    currentPassword: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @Length(1, 32)
    code?: string;

    @IsOptional()
    @IsObject()
    passkeyResponse?: AuthenticationResponseJSON;
}
