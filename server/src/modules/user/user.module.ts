import {Module} from "@nestjs/common";
import {UserController} from "./user.controller";
import {UserService} from "./user.service";
import {JwtAuthGuard} from "../../common/guards/jwt-auth.guard";

@Module({
    controllers: [UserController],
    providers: [UserService, JwtAuthGuard],
    exports: [UserService],
})
export class UserModule {}
