import {IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min} from "class-validator";
import {Transform, Type} from "class-transformer";

function parseBoolean(value: unknown): unknown {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") return true;
        if (normalized === "false" || normalized === "0") return false;
    }
    return value;
}

function parseStringArray(value: unknown): unknown {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        return value
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
    }
    return value;
}

export type BudgetedFilter = "all" | "budgeted" | "unbudgeted";
export type ReportResolution = "day" | "week" | "month" | "quarter" | "year";
export const REPORT_RESOLUTIONS: ReportResolution[] = ["day", "week", "month", "quarter", "year"];

export class ReportFiltersDto {
    @IsDateString()
    startDate!: string;

    @IsDateString()
    endDate!: string;

    @IsOptional()
    @Transform(({value}) => parseStringArray(value))
    @IsArray()
    @IsUUID("7", {each: true})
    accountIds?: string[];

    @IsOptional()
    @Transform(({value}) => parseStringArray(value))
    @IsArray()
    @IsUUID("7", {each: true})
    categoryIds?: string[];

    @IsOptional()
    @Transform(({value}) => parseStringArray(value))
    @IsArray()
    @IsUUID("7", {each: true})
    merchantIds?: string[];

    @IsOptional()
    @Transform(({value}) => parseBoolean(value))
    @IsBoolean()
    includeShared?: boolean;

    @IsOptional()
    @Transform(({value}) => parseBoolean(value))
    @IsBoolean()
    excludeTransfers?: boolean;

    @IsOptional()
    @Transform(({value}) => parseBoolean(value))
    @IsBoolean()
    includeRebalances?: boolean;

    @IsOptional()
    @IsIn(["all", "budgeted", "unbudgeted"])
    budgeted?: BudgetedFilter;

    @IsOptional()
    @IsIn(REPORT_RESOLUTIONS)
    resolution?: ReportResolution;
}

export class TopMerchantsDto extends ReportFiltersDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}
