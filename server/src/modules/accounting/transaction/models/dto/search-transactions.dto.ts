import {IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf} from "class-validator";
import {Transform, Type} from "class-transformer";
import {ApiProperty} from "@nestjs/swagger";

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

export enum TransactionSortBy {
    DATE = "date",
    DESCRIPTION = "description",
    AMOUNT = "amount",
    CATEGORY = "category",
    ACCOUNT = "account",
}

export enum TransactionSortOrder {
    ASC = "asc",
    DESC = "desc",
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

    @ApiProperty({
        required: false,
        description: "UUID v7 de la catégorie, ou 'none' pour ne renvoyer que les transactions sans catégorie.",
        example: "018f8e00-0000-7000-8000-000000000000",
    })
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
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page!: number;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize!: number;

    @IsOptional()
    @IsEnum(TransactionSortBy)
    sortBy?: TransactionSortBy;

    @IsOptional()
    @IsEnum(TransactionSortOrder)
    sortOrder?: TransactionSortOrder;
}
