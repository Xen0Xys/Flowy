import {UserController} from "./user.controller";
import {UserService} from "./user.service";
import {AuthModule} from "../../auth/auth.module";
import {Module} from "@nestjs/common";

@Module({
    controllers: [UserController],
    providers: [UserService],
    imports: [AuthModule],
    exports: [UserService],
})
export class UserModule {}
