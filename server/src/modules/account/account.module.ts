import {Module} from "@nestjs/common";
import {AccountController} from "./account.controller";
import {AccountService} from "./account.service";

@Module({
    controllers: [AccountController],
    providers: [AccountService],
    imports: [],
    exports: [AccountService],
})
export class AccountModule {}
