import {Injectable} from "@nestjs/common";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {PrismaService, TxClient} from "../../helper/prisma.service";

export type ReferenceSuggestion = {
    categoryId: string | null;
    merchantId: string | null;
};

type MatchableEntity = {
    id: string;
    name: string;
    keywords: string[];
    auto_complete_enabled: boolean;
};

@Injectable()
export class ReferenceMatcherService {
    constructor(private readonly prismaService: PrismaService) {}

    async suggestForDescription(user: UserEntity, description: string, tx?: TxClient): Promise<ReferenceSuggestion> {
        const [categories, merchants] = await this.loadEnabledReferences(user, tx);
        return {
            categoryId: this.findBestMatch(description, categories),
            merchantId: this.findBestMatch(description, merchants),
        };
    }

    async loadEnabledReferences(user: UserEntity, tx?: TxClient): Promise<[MatchableEntity[], MatchableEntity[]]> {
        const prisma = this.prismaService.withTx(tx);
        const [categories, merchants] = await Promise.all([
            prisma.userCategories.findMany({
                where: {user_id: user.id, auto_complete_enabled: true},
                select: {id: true, name: true, keywords: true, auto_complete_enabled: true},
            }),
            prisma.userMerchants.findMany({
                where: {user_id: user.id, auto_complete_enabled: true},
                select: {id: true, name: true, keywords: true, auto_complete_enabled: true},
            }),
        ]);
        return [categories, merchants];
    }

    findBestMatch(description: string, entities: MatchableEntity[]): string | null {
        const normalizedDescription = this.stripDiacritics(description);
        if (!normalizedDescription) return null;

        let bestId: string | null = null;
        let bestLength = 0;

        for (const entity of entities) {
            if (!entity.auto_complete_enabled) continue;
            const candidates = [entity.name, ...entity.keywords];
            for (const candidate of candidates) {
                const normalized = this.stripDiacritics(candidate.trim());
                if (!normalized) continue;
                if (normalizedDescription.includes(normalized) && normalized.length > bestLength) {
                    bestId = entity.id;
                    bestLength = normalized.length;
                }
            }
        }

        return bestId;
    }

    private stripDiacritics(s: string): string {
        return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    }
}
