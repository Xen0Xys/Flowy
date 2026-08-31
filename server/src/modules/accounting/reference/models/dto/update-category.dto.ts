import {ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Length, Matches} from "class-validator";

export class UpdateCategoryDto {
    @IsOptional()
    @IsString()
    @Length(1, 50)
    name?: string;

    @IsOptional()
    @IsString()
    @Matches(/^#[0-9A-Fa-f]{6}$/)
    hexColor?: string;

    @IsOptional()
    @IsString()
    @Length(1, 50)
    icon?: string;

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
