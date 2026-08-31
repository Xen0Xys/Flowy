import {ArrayMaxSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, Length, Matches} from "class-validator";

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

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @IsString({each: true})
    @Length(1, 50, {each: true})
    keywords?: string[];

    @IsOptional()
    @IsString()
    @Length(1, 50)
    primaryKeyword?: string | null;

    @IsOptional()
    @IsBoolean()
    autoCompleteEnabled?: boolean;
}
