import {FamilyModule} from "../users/family/family.module";
import HelperModule from "../helper/helper.module";
import {AdminController} from "./admin.controller";
import {UserModule} from "../users/user/user.module";
import {AdminService} from "./admin.service";
import {Module} from "@nestjs/common";
import {AccountModule} from "../accounting/account/account.module";

@Module({
    imports: [HelperModule, FamilyModule, UserModule, AccountModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule {}
