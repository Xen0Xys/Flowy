import {IsEmail, IsString} from "class-validator";

export class UpdateEmailDto {
    @IsEmail()
    @IsString()
    email: string;
}
