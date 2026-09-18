import {IsNotEmpty, IsObject, IsOptional, IsString, Length} from "class-validator";
import {ApiProperty} from "@nestjs/swagger";
import type {AuthenticationResponseJSON} from "@simplewebauthn/server";

export class AdminResetMfaDto {
    @ApiProperty({description: "Current admin password"})
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    @ApiProperty({
        description: "Admin's own MFA code (TOTP or backup); required when the admin has MFA enabled",
        required: false,
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @Length(1, 32)
    code?: string;

    @ApiProperty({
        description: "Admin's own passkey assertion; required when the admin has MFA enabled",
        required: false,
    })
    @IsOptional()
    @IsObject()
    passkeyResponse?: AuthenticationResponseJSON;
}
