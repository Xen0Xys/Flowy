import {IsNotEmpty, IsString, Length} from "class-validator";

export class MfaTotpConfirmDto {
    @IsString()
    @IsNotEmpty()
    @Length(6, 6)
    code: string;
}
