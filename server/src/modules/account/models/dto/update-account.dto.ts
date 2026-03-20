import {IsEnum, IsNumber, IsOptional, IsString, Length} from "class-validator";
import {AccountTypes} from "../../../../../prisma/generated/enums";

export class UpdateAccountDto {
    @IsOptional()
    @IsString()
    @Length(3, 50)
    name?: string;

    @IsOptional()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    balance?: number;

    @IsOptional()
    @IsEnum(AccountTypes)
    type?: AccountTypes;
}
