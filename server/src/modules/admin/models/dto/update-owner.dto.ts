import {IsNotEmpty, IsString, IsUUID} from "class-validator";

export class UpdateOwnerDto {
    @IsNotEmpty()
    @IsString()
    @IsUUID("7")
    ownerId: string;

    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    constructor(partial: Partial<UpdateOwnerDto>) {
        Object.assign(this, partial);
    }
}
