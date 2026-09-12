import {Module} from "@nestjs/common";
import {AccountController} from "./account.controller";
import {AccountService} from "./account.service";
import {AccountAccessService} from "./account-access.service";
import {AccountShareService} from "./account-share.service";
import {UserModule} from "../../users/user/user.module";

@Module({
    controllers: [AccountController],
    providers: [AccountService, AccountAccessService, AccountShareService],
    imports: [UserModule],
    exports: [AccountService, AccountAccessService, AccountShareService],
})
export class AccountModule {}
