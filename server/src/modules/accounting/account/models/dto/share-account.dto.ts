import {IsEnum, IsNotEmpty, IsUUID} from "class-validator";
import {AccountSharePermission} from "../../../../../../prisma/generated/enums";

export class ShareAccountDto {
    @IsNotEmpty()
    @IsUUID("7")
    memberId!: string;

    @IsEnum(AccountSharePermission)
    permission!: AccountSharePermission;
}

export class UpdateAccountShareDto {
    @IsEnum(AccountSharePermission)
    permission!: AccountSharePermission;
}
