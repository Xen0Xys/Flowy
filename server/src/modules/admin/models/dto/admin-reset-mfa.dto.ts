import {IsNotEmpty, IsObject, IsOptional, IsString, Length} from "class-validator";
import type {AuthenticationResponseJSON} from "@simplewebauthn/server";

export class AdminResetMfaDto {
    @IsString()
    @IsNotEmpty()
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
