import {IsNotEmpty, IsOptional, IsString, IsUUID, Length} from "class-validator";

export class SuggestReferenceDto {
    @IsNotEmpty()
    @IsString()
    @Length(1, 255)
    description!: string;

    @IsOptional()
    @IsUUID("7")
    accountId?: string;
}
