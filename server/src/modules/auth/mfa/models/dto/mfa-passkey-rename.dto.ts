import {IsNotEmpty, IsString, Length} from "class-validator";

export class MfaPasskeyRenameDto {
    @IsString()
    @IsNotEmpty()
    @Length(1, 50)
    label: string;
}
