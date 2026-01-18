import {IsEmail, IsNotEmpty, IsString} from "class-validator";

export class InviteMemberDto {
    @IsString()
    @IsNotEmpty()
    @IsEmail()
    email: string;
}
