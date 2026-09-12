import {IsNotEmpty, IsString} from "class-validator";
import {ApiProperty} from "@nestjs/swagger";

export class AdminDeleteUserDto {
    @ApiProperty({description: "Current admin password for confirmation"})
    @IsString()
    @IsNotEmpty()
    currentPassword: string;
}
