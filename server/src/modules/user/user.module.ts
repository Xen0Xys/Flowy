import {UserController} from "./user.controller";
import {UserService} from "./user.service";
import {Module} from "@nestjs/common";

@Module({
    controllers: [UserController],
    providers: [UserService],
    exports: [UserService],
})
export class UserModule {}
