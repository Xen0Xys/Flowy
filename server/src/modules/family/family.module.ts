import {FamilyController} from "./family.controller";
import {FamilyService} from "./family.service";
import {UserModule} from "../user/user.module";
import {Module} from "@nestjs/common";

@Module({
    controllers: [FamilyController],
    providers: [FamilyService],
    imports: [UserModule],
    exports: [FamilyService],
})
export class FamilyModule {}
