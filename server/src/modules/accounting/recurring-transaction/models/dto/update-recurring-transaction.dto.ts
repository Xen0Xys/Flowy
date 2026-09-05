import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Max,
    Min,
    NotEquals,
} from "class-validator";
import {RecurrenceFrequency} from "../../../../../../prisma/generated/client";

export class UpdateRecurringTransactionDto {
    @IsOptional()
    @IsString()
    @Length(1, 255)
    name?: string;

    @IsOptional()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    @NotEquals(0)
    amount?: number;

    @IsOptional()
    @IsUUID("7")
    merchantId?: string | null;

    @IsOptional()
    @IsUUID("7")
    categoryId?: string | null;

    @IsOptional()
    @IsEnum(RecurrenceFrequency)
    frequency?: RecurrenceFrequency;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(31)
    dayOfMonth?: number | null;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(6)
    dayOfWeek?: number | null;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(12)
    monthOfYear?: number | null;

    @IsOptional()
    @IsString()
    @Length(1, 64)
    timezone?: string;

    @IsOptional()
    @IsBoolean()
    inBudget?: boolean;

    @IsOptional()
    @IsBoolean()
    isEnabled?: boolean;
}
