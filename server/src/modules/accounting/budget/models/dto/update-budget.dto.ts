import {IsArray, IsNumber, IsOptional, Max, Min, ValidateNested} from "class-validator";
import {Type} from "class-transformer";
import {BudgetedCategoryDto} from "./budgeted-category.dto";

export class UpdateBudgetDto {
    @IsOptional()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 0})
    @Min(1)
    @Max(12)
    month?: number;

    @IsOptional()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 0})
    @Min(1)
    @Max(9999)
    year?: number;

    @IsOptional()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    @Min(0.01)
    budgetedIncome?: number;

    @IsOptional()
    @IsArray()
    @ValidateNested({each: true})
    @Type(() => BudgetedCategoryDto)
    categories?: BudgetedCategoryDto[];
}
