import {IsString, IsStrongPassword, Length} from "class-validator";

export class SetPasswordDto {
    @IsString()
    @Length(15, 256)
    @IsStrongPassword({
        minLength: 15,
        minLowercase: 0,
        minUppercase: 0,
        minNumbers: 0,
        minSymbols: 0,
    })
    password: string;
}
