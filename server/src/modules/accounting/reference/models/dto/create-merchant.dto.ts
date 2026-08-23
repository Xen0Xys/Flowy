import {ArrayMaxSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, Length} from "class-validator";

export class CreateMerchantDto {
    @IsNotEmpty()
    @IsString()
    @Length(1, 50)
    name!: string;

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
