import {IsBoolean, IsNotEmpty} from "class-validator";

export class ToggleRecurringTransactionDto {
    @IsNotEmpty()
    @IsBoolean()
    isEnabled!: boolean;
}
