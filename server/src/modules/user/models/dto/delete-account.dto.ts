import {ApiProperty} from "@nestjs/swagger";
import {IsNotEmpty, IsString, MinLength} from "class-validator";

export class DeleteAccountDto {
    @ApiProperty({description: "Current password for confirmation"})
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    currentPassword: string;
}
