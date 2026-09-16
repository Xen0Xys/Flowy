import {IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsUUID, Max, Min} from "class-validator";
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

function parseAccountIds(value: unknown): unknown {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        return value
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
    }
    return value;
}

export class ReportFiltersDto {
    @IsDateString()
    startDate!: string;

    @IsDateString()
    endDate!: string;

    @IsOptional()
    @Transform(({value}) => parseAccountIds(value))
    @IsArray()
    @IsUUID("7", {each: true})
    accountIds?: string[];

    @IsOptional()
    @Transform(({value}) => parseBoolean(value))
    @IsBoolean()
    includeShared?: boolean;
}

export class TopMerchantsDto extends ReportFiltersDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}
