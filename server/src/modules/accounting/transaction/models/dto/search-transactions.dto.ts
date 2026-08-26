import {IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf} from "class-validator";
import {Transform, Type} from "class-transformer";

export enum TransactionSearchType {
    ALL = "all",
    INCOME = "income",
    EXPENSE = "expense",
}

export enum TransactionSearchRebalance {
    ALL = "all",
    ONLY = "only",
    EXCLUDE = "exclude",
}

export class TransactionFiltersDto {
    @IsOptional()
    @IsString()
    @Length(1, 255)
    @Transform(({value}) => {
        if (typeof value !== "string") return value;
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : undefined;
    })
    search?: string;

    @IsOptional()
    @IsEnum(TransactionSearchType)
    type?: TransactionSearchType;

    @IsOptional()
    @IsUUID("7")
    accountId?: string;

    @IsOptional()
    @IsString()
    @ValidateIf((o) => o.categoryId !== "none")
    @IsUUID("7")
    categoryId?: string;

    @IsOptional()
    @IsUUID("7")
    merchantId?: string;

    @IsOptional()
    @IsEnum(TransactionSearchRebalance)
    rebalance?: TransactionSearchRebalance;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;
}

export class SearchTransactionsDto extends TransactionFiltersDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number;
}
