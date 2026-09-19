import {IsNotEmpty, IsString} from "class-validator";

export class QuitFamilyDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;
}
