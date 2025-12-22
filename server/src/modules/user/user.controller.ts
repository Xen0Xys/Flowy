import {UserService} from "./user.service";
import {Controller} from "@nestjs/common";

@Controller("user")
export class UserController {
    constructor(private readonly userService: UserService) {}
}
