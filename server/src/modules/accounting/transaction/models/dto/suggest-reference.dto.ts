import {IsNotEmpty, IsString, IsUUID, Length} from "class-validator";

export class SuggestReferenceDto {
    @IsNotEmpty()
    @IsString()
    @Length(1, 255)
    description!: string;

    // Required so suggestions are always scoped to the account owner's
    // references. Without it, a sharee would see their own merchants/categories
    // which the transaction endpoint would then reject as owner-mismatched.
    @IsUUID("7")
    accountId!: string;
}
