import {FamilyModule} from "../users/family/family.module";
import {AdminController} from "./admin.controller";
import {UserModule} from "../users/user/user.module";
import {AdminService} from "./admin.service";
import {Module} from "@nestjs/common";
import {AccountModule} from "../accounting/account/account.module";
import {HelperModule} from "../helper/helper.module";
import {MfaModule} from "../auth/mfa/mfa.module";
import {SsoModule} from "../auth/sso/sso.module";

@Module({
    imports: [HelperModule, FamilyModule, UserModule, AccountModule, MfaModule, SsoModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule {}
