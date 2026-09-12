import {ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsUUID, Max, Min} from "class-validator";
import {Transform, Type} from "class-transformer";

export class GetPlannedByAccountsDto {
    @IsNotEmpty()
    @Type(() => Number)
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 0})
    @Min(1)
    @Max(12)
    month!: number;

    @IsNotEmpty()
    @Type(() => Number)
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 0})
    @Min(1)
    @Max(9999)
    year!: number;

    @Transform(({value}) => (typeof value === "string" ? value.split(",").filter(Boolean) : value))
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID("7", {each: true})
    accountIds!: string[];
}
