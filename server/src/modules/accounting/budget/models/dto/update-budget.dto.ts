import {
    ArrayMinSize,
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Max,
    Min,
    ValidateNested,
} from "class-validator";
import {Type} from "class-transformer";
import {BudgetedCategoryDto} from "./budgeted-category.dto";

export class UpdateBudgetDto {
    @IsOptional()
    @IsString()
    @Length(0, 50)
    name?: string | null;

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

    // Only mutable by the account owner; sharees cannot change the account scope.
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID("7", {each: true})
    accountIds?: string[];
}
