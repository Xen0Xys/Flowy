import {ApiPropertyOptional} from "@nestjs/swagger";
import {Transform, Type} from "class-transformer";
import {IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min} from "class-validator";

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

export class SearchTransactionsDto {
    @ApiPropertyOptional({
        description: "Free-text search on description, merchant name and category name",
        minLength: 1,
        maxLength: 255,
    })
    @IsOptional()
    @IsString()
    @Length(1, 255)
    @Transform(({value}) => {
        if (typeof value !== "string") {
            return value;
        }

        const normalized = value.trim();
        return normalized.length > 0 ? normalized : undefined;
    })
    search?: string;

    @ApiPropertyOptional({
        enum: TransactionSearchType,
        default: TransactionSearchType.ALL,
    })
    @IsOptional()
    @IsEnum(TransactionSearchType)
    type?: TransactionSearchType;

    @ApiPropertyOptional({
        description: "Filter by account id",
        format: "uuid",
        example: "0195c8dd-c263-7569-99f6-9fc20aca3050",
    })
    @IsOptional()
    @IsUUID("7")
    accountId?: string;

    @ApiPropertyOptional({
        description: "Filter by category id",
        format: "uuid",
        example: "0195c8dd-c263-7569-99f6-9fc20aca3051",
    })
    @IsOptional()
    @IsUUID("7")
    categoryId?: string;

    @ApiPropertyOptional({
        description: "Filter by merchant id",
        format: "uuid",
        example: "0195c8dd-c263-7569-99f6-9fc20aca3052",
    })
    @IsOptional()
    @IsUUID("7")
    merchantId?: string;

    @ApiPropertyOptional({
        enum: TransactionSearchRebalance,
        default: TransactionSearchRebalance.ALL,
    })
    @IsOptional()
    @IsEnum(TransactionSearchRebalance)
    rebalance?: TransactionSearchRebalance;

    @ApiPropertyOptional({
        description: "Inclusive start date (ISO-8601)",
        example: "2026-01-01",
    })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({
        description: "Inclusive end date (ISO-8601)",
        example: "2026-01-31",
    })
    @IsOptional()
    @IsDateString()
    endDate?: string;

    @ApiPropertyOptional({description: "Page number (optional)", minimum: 1, default: 1})
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({description: "Page size (optional)", minimum: 1, maximum: 100, default: 25})
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number;
}
