import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Max,
    Min,
    NotEquals,
    ValidateIf,
} from "class-validator";
import {RecurrenceFrequency} from "../../../../../../prisma/generated/client";

export class CreateRecurringTransactionDto {
    @IsNotEmpty()
    @IsString()
    @Length(1, 255)
    name!: string;

    @IsNotEmpty()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    @NotEquals(0)
    amount!: number;

    @IsOptional()
    @IsUUID("7")
    merchantId?: string;

    @IsOptional()
    @IsUUID("7")
    categoryId?: string;

    @IsNotEmpty()
    @IsEnum(RecurrenceFrequency)
    frequency!: RecurrenceFrequency;

    @ValidateIf((o: CreateRecurringTransactionDto) => o.frequency !== RecurrenceFrequency.WEEKLY)
    @IsNotEmpty()
    @IsInt()
    @Min(1)
    @Max(31)
    dayOfMonth?: number;

    @ValidateIf((o: CreateRecurringTransactionDto) => o.frequency === RecurrenceFrequency.WEEKLY)
    @IsNotEmpty()
    @IsInt()
    @Min(0)
    @Max(6)
    dayOfWeek?: number;

    @IsNotEmpty()
    @IsString()
    @Length(1, 64)
    timezone!: string;

    @IsNotEmpty()
    @IsBoolean()
    inBudget!: boolean;

    @IsOptional()
    @IsBoolean()
    isEnabled?: boolean;
}
