import {Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards} from "@nestjs/common";
import {ApiBearerAuth} from "@nestjs/swagger";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {User} from "../../../common/decorators/user.decorator";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {ReferenceService} from "./reference.service";
import {CategoryEntity} from "./models/entities/category.entity";
import {MerchantEntity} from "./models/entities/merchant.entity";
import {CreateCategoryDto} from "./models/dto/create-category.dto";
import {UpdateCategoryDto} from "./models/dto/update-category.dto";
import {CreateMerchantDto} from "./models/dto/create-merchant.dto";
import {UpdateMerchantDto} from "./models/dto/update-merchant.dto";

@Controller("reference")
export class ReferenceController {
    constructor(private readonly referenceService: ReferenceService) {}

    @Get("categories")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getCategories(@User() user: UserEntity): Promise<CategoryEntity[]> {
        return this.referenceService.getCategories(user);
    }

    @Post("category")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async createCategory(@User() user: UserEntity, @Body() body: CreateCategoryDto): Promise<CategoryEntity> {
        return this.referenceService.createCategory(user, body);
    }

    @Patch("category/:categoryId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async updateCategory(
        @User() user: UserEntity,
        @Param("categoryId", new ParseUUIDPipe({version: "7"})) categoryId: string,
        @Body() body: UpdateCategoryDto,
    ): Promise<CategoryEntity> {
        return this.referenceService.updateCategory(user, categoryId, body);
    }

    @Delete("category/:categoryId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async deleteCategory(
        @User() user: UserEntity,
        @Param("categoryId", new ParseUUIDPipe({version: "7"})) categoryId: string,
    ): Promise<void> {
        await this.referenceService.deleteCategory(user, categoryId);
    }

    @Get("merchants")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getMerchants(@User() user: UserEntity): Promise<MerchantEntity[]> {
        return this.referenceService.getMerchants(user);
    }

    @Post("merchant")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async createMerchant(@User() user: UserEntity, @Body() body: CreateMerchantDto): Promise<MerchantEntity> {
        return this.referenceService.createMerchant(user, body);
    }

    @Patch("merchant/:merchantId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async updateMerchant(
        @User() user: UserEntity,
        @Param("merchantId", new ParseUUIDPipe({version: "7"})) merchantId: string,
        @Body() body: UpdateMerchantDto,
    ): Promise<MerchantEntity> {
        return this.referenceService.updateMerchant(user, merchantId, body);
    }

    @Delete("merchant/:merchantId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async deleteMerchant(
        @User() user: UserEntity,
        @Param("merchantId", new ParseUUIDPipe({version: "7"})) merchantId: string,
    ): Promise<void> {
        await this.referenceService.deleteMerchant(user, merchantId);
    }
}
