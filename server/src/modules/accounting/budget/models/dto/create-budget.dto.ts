import {ArrayMinSize, IsArray, IsNotEmpty, IsNumber, Max, Min, ValidateNested} from "class-validator";
import {Type} from "class-transformer";
import {BudgetedCategoryDto} from "./budgeted-category.dto";

export class CreateBudgetDto {
    @IsNotEmpty()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 0})
    @Min(1)
    @Max(12)
    month!: number;

    @IsNotEmpty()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 0})
    @Min(1)
    @Max(9999)
    year!: number;

    @IsNotEmpty()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    @Min(0.01)
    budgetedIncome!: number;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({each: true})
    @Type(() => BudgetedCategoryDto)
    categories!: BudgetedCategoryDto[];
}
