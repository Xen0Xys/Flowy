import {UserController} from "./user.controller";
import {UserService} from "./user.service";
import {AuthModule} from "../../auth/auth.module";
import {forwardRef, Module} from "@nestjs/common";

@Module({
    controllers: [UserController],
    providers: [UserService],
    imports: [forwardRef(() => AuthModule)],
    exports: [UserService],
})
export class UserModule {}
