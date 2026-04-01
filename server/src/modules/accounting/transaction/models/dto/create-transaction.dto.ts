import {
    IsBoolean,
    IsDateString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    NotEquals,
} from "class-validator";

export class CreateTransactionDto {
    @IsNotEmpty()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    @NotEquals(0)
    amount: number;

    @IsNotEmpty()
    @IsString()
    @Length(1, 255)
    description: string;

    @IsNotEmpty()
    @IsDateString()
    date: string;

    @IsOptional()
    @IsUUID("7")
    merchantId?: string;

    @IsOptional()
    @IsUUID("7")
    categoryId?: string;

    @IsOptional()
    @IsBoolean()
    isRebalance?: boolean;

    constructor(partial: Partial<CreateTransactionDto>) {
        Object.assign(this, partial);
    }
}
