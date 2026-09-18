import {IsNotEmpty, IsObject, IsOptional, IsString} from "class-validator";
import type {AuthenticationResponseJSON} from "@simplewebauthn/server";

export class MfaRegenerateCodesDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    code?: string;

    @IsOptional()
    @IsObject()
    passkeyResponse?: AuthenticationResponseJSON;
}
