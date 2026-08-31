import {IsNotEmpty, IsString, Length} from "class-validator";

export class SuggestReferenceDto {
    @IsNotEmpty()
    @IsString()
    @Length(1, 255)
    description!: string;
}
