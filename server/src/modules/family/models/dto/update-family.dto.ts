import {IsOptional, IsString, Length} from "class-validator";

export class UpdateFamilyDto {
    @IsOptional()
    @IsString()
    @Length(1, 50)
    name?: string;

    @IsOptional()
    @IsString()
    @Length(3, 3)
    currency?: string;
}
