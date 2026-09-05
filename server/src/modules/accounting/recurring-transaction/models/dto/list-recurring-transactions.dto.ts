import {IsIn, IsOptional, IsUUID} from "class-validator";

export class ListRecurringTransactionsDto {
    @IsOptional()
    @IsUUID("7")
    accountId?: string;

    @IsOptional()
    @IsIn(["true", "false"])
    enabled?: "true" | "false";
}
