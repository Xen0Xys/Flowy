import {ConflictException, ForbiddenException, Injectable, NotFoundException} from "@nestjs/common";
import {PrismaService} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {UserCategories, UserMerchants} from "../../../../prisma/generated/client";
import {CategoryEntity} from "./models/entities/category.entity";
import {MerchantEntity} from "./models/entities/merchant.entity";
import {CreateCategoryDto} from "./models/dto/create-category.dto";
import {UpdateCategoryDto} from "./models/dto/update-category.dto";
import {CreateMerchantDto} from "./models/dto/create-merchant.dto";
import {UpdateMerchantDto} from "./models/dto/update-merchant.dto";

@Injectable()
export class ReferenceService {
    constructor(private readonly prismaService: PrismaService) {}

    private async getCategoryOrThrow(user: UserEntity, categoryId: string): Promise<UserCategories> {
        const category = await this.prismaService.userCategories.findUnique({
            where: {
                id: categoryId,
            },
        });

        if (!category) {
            throw new NotFoundException("Category not found");
        }

        if (category.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to access this category");
        }

        return category;
    }

    private async getMerchantOrThrow(user: UserEntity, merchantId: string): Promise<UserMerchants> {
        const merchant = await this.prismaService.userMerchants.findUnique({
            where: {
                id: merchantId,
            },
        });

        if (!merchant) {
            throw new NotFoundException("Merchant not found");
        }

        if (merchant.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to access this merchant");
        }

        return merchant;
    }

    private toCategoryEntity(category: UserCategories): CategoryEntity {
        return new CategoryEntity({
            id: category.id,
            userId: category.user_id,
            name: category.name,
            hexColor: category.hex_color,
            icon: category.icon,
            createdAt: category.created_at,
            updatedAt: category.updated_at,
        });
    }

    private toMerchantEntity(merchant: UserMerchants): MerchantEntity {
        return new MerchantEntity({
            id: merchant.id,
            userId: merchant.user_id,
            name: merchant.name,
            createdAt: merchant.created_at,
            updatedAt: merchant.updated_at,
        });
    }

    async getCategories(user: UserEntity): Promise<CategoryEntity[]> {
        const categories = await this.prismaService.userCategories.findMany({
            where: {
                user_id: user.id,
            },
            orderBy: {
                name: "asc",
            },
        });

        return categories.map((category) => this.toCategoryEntity(category));
    }

    async createCategory(user: UserEntity, body: CreateCategoryDto): Promise<CategoryEntity> {
        const existingCategory = await this.prismaService.userCategories.findFirst({
            where: {
                user_id: user.id,
                name: body.name,
            },
        });

        if (existingCategory) {
            throw new ConflictException("Category already exists");
        }

        const category = await this.prismaService.userCategories.create({
            data: {
                user_id: user.id,
                name: body.name,
                hex_color: body.hexColor,
                icon: body.icon,
            },
        });

        return this.toCategoryEntity(category);
    }

    async updateCategory(user: UserEntity, categoryId: string, body: UpdateCategoryDto): Promise<CategoryEntity> {
        const category = await this.getCategoryOrThrow(user, categoryId);

        if (body.name !== undefined && body.name !== category.name) {
            const existingCategory = await this.prismaService.userCategories.findFirst({
                where: {
                    user_id: user.id,
                    name: body.name,
                },
            });

            if (existingCategory) {
                throw new ConflictException("Category already exists");
            }
        }

        const updatedCategory = await this.prismaService.userCategories.update({
            where: {
                id: categoryId,
            },
            data: {
                ...(body.name !== undefined ? {name: body.name} : {}),
                ...(body.hexColor !== undefined ? {hex_color: body.hexColor} : {}),
                ...(body.icon !== undefined ? {icon: body.icon} : {}),
            },
        });

        return this.toCategoryEntity(updatedCategory);
    }

    async deleteCategory(user: UserEntity, categoryId: string): Promise<void> {
        await this.getCategoryOrThrow(user, categoryId);

        await this.prismaService.userCategories.delete({
            where: {
                id: categoryId,
            },
        });
    }

    async getMerchants(user: UserEntity): Promise<MerchantEntity[]> {
        const merchants = await this.prismaService.userMerchants.findMany({
            where: {
                user_id: user.id,
            },
            orderBy: {
                name: "asc",
            },
        });

        return merchants.map((merchant) => this.toMerchantEntity(merchant));
    }

    async createMerchant(user: UserEntity, body: CreateMerchantDto): Promise<MerchantEntity> {
        const existingMerchant = await this.prismaService.userMerchants.findFirst({
            where: {
                user_id: user.id,
                name: body.name,
            },
        });

        if (existingMerchant) {
            throw new ConflictException("Merchant already exists");
        }

        const merchant = await this.prismaService.userMerchants.create({
            data: {
                user_id: user.id,
                name: body.name,
            },
        });

        return this.toMerchantEntity(merchant);
    }

    async updateMerchant(user: UserEntity, merchantId: string, body: UpdateMerchantDto): Promise<MerchantEntity> {
        const merchant = await this.getMerchantOrThrow(user, merchantId);

        if (body.name !== undefined && body.name !== merchant.name) {
            const existingMerchant = await this.prismaService.userMerchants.findFirst({
                where: {
                    user_id: user.id,
                    name: body.name,
                },
            });

            if (existingMerchant) {
                throw new ConflictException("Merchant already exists");
            }
        }

        const updatedMerchant = await this.prismaService.userMerchants.update({
            where: {
                id: merchantId,
            },
            data: body.name !== undefined ? {name: body.name} : {},
        });

        return this.toMerchantEntity(updatedMerchant);
    }

    async deleteMerchant(user: UserEntity, merchantId: string): Promise<void> {
        await this.getMerchantOrThrow(user, merchantId);

        await this.prismaService.userMerchants.delete({
            where: {
                id: merchantId,
            },
        });
    }
}
