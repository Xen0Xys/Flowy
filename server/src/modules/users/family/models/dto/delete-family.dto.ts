import {IsNotEmpty, IsString} from "class-validator";

export class DeleteFamilyDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;
}
