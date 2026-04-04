import {IsNotEmpty, IsNumber, IsUUID, Min} from "class-validator";

export class BudgetedCategoryDto {
    @IsNotEmpty()
    @IsUUID("7")
    categoryId!: string;

    @IsNotEmpty()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    @Min(0.01)
    amount!: number;
}
