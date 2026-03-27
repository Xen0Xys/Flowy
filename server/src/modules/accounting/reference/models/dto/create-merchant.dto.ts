import {IsNotEmpty, IsString, Length} from "class-validator";

export class CreateMerchantDto {
    @IsNotEmpty()
    @IsString()
    @Length(1, 50)
    name!: string;
}
