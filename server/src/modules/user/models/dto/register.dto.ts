import {
    IsEmail,
    IsNotEmpty,
    IsString,
    IsStrongPassword,
    Length,
} from "class-validator";

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
    @Length(6, 128)
    @IsStrongPassword({
        minLength: 6,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
    })
    @IsNotEmpty()
    password: string;
}
