import {
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Length,
} from "class-validator";
import {AccountTypes} from "../../../../../prisma/generated/enums";

export class CreateAccountDto {
    @IsNotEmpty()
    @IsString()
    @Length(3, 50)
    name: string;

    @IsOptional()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    balance?: number;

    @IsNotEmpty()
    @IsEnum(AccountTypes)
    type: AccountTypes;
}
