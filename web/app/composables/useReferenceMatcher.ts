import type {TransactionCategory, TransactionMerchant} from "~/stores/transaction.store";

type Matchable = {
    id: string;
    name: string;
    keywords: string[];
    autoCompleteEnabled: boolean;
};

export type ReferenceMatch = {
    categoryId: string | null;
    merchantId: string | null;
};

function stripDiacritics(s: string): string {
    return s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
}

function findBestMatch(description: string, entities: Matchable[]): string | null {
    const normalized = stripDiacritics(description);
    if (!normalized) return null;

    let bestId: string | null = null;
    let bestLength = 0;

    for (const entity of entities) {
        if (!entity.autoCompleteEnabled) continue;
        const candidates = [entity.name, ...entity.keywords];
        for (const candidate of candidates) {
            const normalizedCandidate = stripDiacritics(candidate.trim());
            if (!normalizedCandidate) continue;
            if (normalized.includes(normalizedCandidate) && normalizedCandidate.length > bestLength) {
                bestId = entity.id;
                bestLength = normalizedCandidate.length;
            }
        }
    }

    return bestId;
}

export function useReferenceMatcher() {
    const matchDescription = (
        description: string,
        categories: TransactionCategory[],
        merchants: TransactionMerchant[],
    ): ReferenceMatch => ({
        categoryId: findBestMatch(description, categories),
        merchantId: findBestMatch(description, merchants),
    });

    const primaryKeywordFor = (entity: {name: string; primaryKeyword: string | null} | null | undefined): string => {
        if (!entity) return "";
        return entity.primaryKeyword?.trim() || entity.name;
    };

    return {matchDescription, primaryKeywordFor};
}
