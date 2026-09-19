import {IsNotEmpty, IsString} from "class-validator";

export class AdminDeleteUserDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;
}
