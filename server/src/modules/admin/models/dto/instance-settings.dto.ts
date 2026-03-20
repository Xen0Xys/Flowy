import {IsBoolean, IsNotEmpty, IsOptional, IsString} from "class-validator";

export class InstanceSettingsDto {
    @IsNotEmpty()
    @IsBoolean()
    registrationEnabled: boolean;

    @IsOptional()
    @IsString()
    instanceOwner?: string;

    constructor(partial: Partial<InstanceSettingsDto>) {
        Object.assign(this, partial);
    }
}
