import {IsString, IsStrongPassword, Length} from "class-validator";

export class UpdatePasswordDto {
    @IsString()
    old_password: string;

    @IsString()
    @Length(6, 128)
    @IsStrongPassword({
        minLength: 6,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
    })
    password: string;
}
