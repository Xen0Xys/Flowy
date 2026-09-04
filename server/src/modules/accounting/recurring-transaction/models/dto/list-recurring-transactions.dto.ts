import {IsBooleanString, IsOptional, IsUUID} from "class-validator";

export class ListRecurringTransactionsDto {
    @IsOptional()
    @IsUUID("7")
    accountId?: string;

    @IsOptional()
    @IsBooleanString()
    enabled?: string;
}
