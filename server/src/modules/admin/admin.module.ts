import {Module} from "@nestjs/common";
import AdminController from "./admin.controller";
import HelperModule from "../helper/helper.module";
import {AdminService} from "./admin.service";

@Module({
    imports: [HelperModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export default class AdminModule {}
