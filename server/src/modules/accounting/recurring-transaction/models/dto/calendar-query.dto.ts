import {Type} from "class-transformer";
import {IsInt, IsNotEmpty, Max, Min} from "class-validator";

export class CalendarQueryDto {
    @IsNotEmpty()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(9999)
    year!: number;

    @IsNotEmpty()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(12)
    month!: number;
}
