import {IsISO4217CurrencyCode, IsNotEmpty, IsString} from "class-validator";

export class CreateFamilyDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    @IsISO4217CurrencyCode()
    currency: string;
}
