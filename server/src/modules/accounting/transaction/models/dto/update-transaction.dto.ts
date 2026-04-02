import {IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Length} from "class-validator";

export class UpdateTransactionDto {
    @IsOptional()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    amount?: number;

    @IsOptional()
    @IsString()
    @Length(1, 255)
    description?: string;

    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsUUID("7")
    merchantId?: string | null;

    @IsOptional()
    @IsUUID("7")
    categoryId?: string | null;

    @IsOptional()
    @IsBoolean()
    isRebalance?: boolean;
}
