import HelperModule from "../helper/helper.module";
import {AdminController} from "./admin.controller";
import {AdminService} from "./admin.service";
import {Module} from "@nestjs/common";

@Module({
    imports: [HelperModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule {}
