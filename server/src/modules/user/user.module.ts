import {JwtAuthGuard} from "../../common/guards/jwt-auth.guard";
import {UserController} from "./user.controller";
import {UserService} from "./user.service";
import {Module} from "@nestjs/common";

@Module({
    controllers: [UserController],
    providers: [UserService, JwtAuthGuard],
    exports: [UserService],
})
export class UserModule {}
