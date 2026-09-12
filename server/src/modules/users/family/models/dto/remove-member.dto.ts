import {IsNotEmpty, IsString} from "class-validator";
import {ApiProperty} from "@nestjs/swagger";

export class RemoveMemberDto {
    @ApiProperty({description: "Current password for confirmation"})
    @IsString()
    @IsNotEmpty()
    currentPassword: string;
}
