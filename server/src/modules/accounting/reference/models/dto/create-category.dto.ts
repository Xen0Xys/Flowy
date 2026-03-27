import {IsNotEmpty, IsString, Length, Matches} from "class-validator";

export class CreateCategoryDto {
    @IsNotEmpty()
    @IsString()
    @Length(1, 50)
    name!: string;

    @IsNotEmpty()
    @IsString()
    @Matches(/^#[0-9A-Fa-f]{6}$/)
    hexColor!: string;

    @IsNotEmpty()
    @IsString()
    @Length(1, 50)
    icon!: string;
}
