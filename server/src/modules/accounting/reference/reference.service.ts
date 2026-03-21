import {Injectable} from "@nestjs/common";
import {PrismaService} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {UserCategories, UserMerchants} from "../../../../prisma/generated/client";
import {CategoryEntity} from "./models/entities/category.entity";
import {MerchantEntity} from "./models/entities/merchant.entity";

@Injectable()
export class ReferenceService {
    constructor(private readonly prismaService: PrismaService) {}

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
}
