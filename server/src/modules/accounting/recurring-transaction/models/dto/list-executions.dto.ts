import {Type} from "class-transformer";
import {IsInt, Max, Min} from "class-validator";

export class ListExecutionsDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page!: number;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize!: number;
}
