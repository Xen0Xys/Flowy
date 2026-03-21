import {Controller, Get, UseGuards} from "@nestjs/common";
import {ApiBearerAuth} from "@nestjs/swagger";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {User} from "../../../common/decorators/user.decorator";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {ReferenceService} from "./reference.service";
import {CategoryEntity} from "./models/entities/category.entity";
import {MerchantEntity} from "./models/entities/merchant.entity";

@Controller("reference")
export class ReferenceController {
    constructor(private readonly referenceService: ReferenceService) {}

    @Get("categories")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getCategories(@User() user: UserEntity): Promise<CategoryEntity[]> {
        return this.referenceService.getCategories(user);
    }

    @Get("merchants")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getMerchants(@User() user: UserEntity): Promise<MerchantEntity[]> {
        return this.referenceService.getMerchants(user);
    }
}
