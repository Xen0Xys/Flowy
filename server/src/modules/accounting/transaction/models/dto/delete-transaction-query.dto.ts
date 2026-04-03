import {Transform} from "class-transformer";
import {IsIn, IsOptional} from "class-validator";

export class DeleteTransactionQueryDto {
    @IsOptional()
    @Transform(({value}) => {
        if (typeof value !== "string") return value;
        return value.toLowerCase();
    })
    @IsIn(["true", "false"])
    keepLinkedTransaction?: string;
}
