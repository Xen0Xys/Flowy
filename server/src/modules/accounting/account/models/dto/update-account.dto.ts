import {IsEnum, IsNumber, IsOptional, IsString, Length, Matches} from "class-validator";
import {AccountTypes} from "../../../../../../prisma/generated/enums";

export class UpdateAccountDto {
    @IsOptional()
    @IsString()
    @Length(3, 50)
    @Matches(/^[\p{L}\p{N}\s\-'&.,()]+$/u)
    name?: string;

    @IsOptional()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    balance?: number;

    @IsOptional()
    @IsEnum(AccountTypes)
    type?: AccountTypes;
}
