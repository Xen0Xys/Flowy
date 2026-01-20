import {
    IsISO4217CurrencyCode,
    IsNotEmpty,
    IsString,
    Length,
} from "class-validator";

export class CreateFamilyDto {
    @IsString()
    @IsNotEmpty()
    @Length(3, 50)
    name: string;

    @IsString()
    @IsNotEmpty()
    @IsISO4217CurrencyCode()
    currency: string;
}
