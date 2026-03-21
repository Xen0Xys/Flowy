import {IsEmail, IsNotEmpty, IsString, IsStrongPassword, Length} from "class-validator";

export class RegisterDto {
    @IsString()
    @Length(3, 30)
    @IsNotEmpty()
    username: string;

    @IsString()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @Length(15, 256)
    @IsStrongPassword({
        minLength: 15,
        minLowercase: 0,
        minUppercase: 0,
        minNumbers: 0,
        minSymbols: 0,
    })
    @IsNotEmpty()
    password: string;
}
