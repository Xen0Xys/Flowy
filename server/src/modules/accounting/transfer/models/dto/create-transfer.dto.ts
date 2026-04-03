import {IsDateString, IsNotEmpty, IsNumber, IsString, IsUUID, Length, NotEquals} from "class-validator";

export class CreateTransferDto {
    @IsNotEmpty()
    @IsString()
    @IsUUID("7")
    debitAccountId!: string;

    @IsNotEmpty()
    @IsString()
    @IsUUID("7")
    creditAccountId!: string;

    @IsNotEmpty()
    @IsString()
    @Length(1, 255)
    description!: string;

    @IsNotEmpty()
    @IsDateString()
    date!: string;

    @IsNotEmpty()
    @IsNumber({allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2})
    @NotEquals(0)
    amount!: number;
}
