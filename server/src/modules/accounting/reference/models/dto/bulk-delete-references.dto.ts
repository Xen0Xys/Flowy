import {ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID} from "class-validator";

export class BulkDeleteReferencesDto {
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(200)
    @IsUUID("7", {each: true})
    ids!: string[];
}
