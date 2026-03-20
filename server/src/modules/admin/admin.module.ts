import {FamilyModule} from "../family/family.module";
import HelperModule from "../helper/helper.module";
import {AdminController} from "./admin.controller";
import {UserModule} from "../user/user.module";
import {AdminService} from "./admin.service";
import {Module} from "@nestjs/common";
import {AccountModule} from "../account/account.module";

@Module({
    imports: [HelperModule, FamilyModule, UserModule, AccountModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule {}
