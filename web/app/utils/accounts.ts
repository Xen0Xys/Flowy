import type {
    Account,
    AccountBalanceEvolutionPoint,
} from "~/stores/account.store";

export type TimeRange = "7D" | "1M" | "3M" | "6M" | "1Y" | "ALL";

export function buildDateRange(preset: TimeRange): {
    startDate: string;
    endDate: string;
} {
    const end = new Date();
    const start = new Date();

    switch (preset) {
        case "7D":
            start.setDate(end.getDate() - 7);
            break;
        case "1M":
            start.setMonth(end.getMonth() - 1);
            break;
        case "3M":
            start.setMonth(end.getMonth() - 3);
            break;
        case "6M":
            start.setMonth(end.getMonth() - 6);
            break;
        case "1Y":
            start.setFullYear(end.getFullYear() - 1);
            break;
        case "ALL":
            start.setFullYear(2000); // 2000 as start date for "ALL"
            break;
    }

    return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
    };
}

export function computeTotalBalance(accounts: Account[]): number {
    return accounts.reduce((sum, account) => sum + account.balance, 0);
}

export function groupAccountsByType(
    accounts: Account[],
): Record<string, Account[]> {
    return accounts.reduce(
        (acc, account) => {
            if (!acc[account.type]) {
                acc[account.type] = [];
            }
            acc[account.type]!.push(account);
            return acc;
        },
        {} as Record<string, Account[]>,
    );
}

export const CATEGORY_ORDER: Record<string, number> = {
    CHECKING: 1,
    SAVINGS: 2,
    INVESTMENT: 3,
    CREDIT: 4,
    CASH: 5,
    OTHER: 6,
};

export function computeCategoryStats(groups: Record<string, Account[]>) {
    const absoluteTotal = Object.values(groups)
        .flat()
        .reduce((sum, a) => sum + Math.abs(a.balance), 0);

    return Object.entries(groups)
        .map(([type, accounts]) => {
            const value = accounts.reduce((sum, a) => sum + a.balance, 0);
            const absCategoryValue = accounts.reduce(
                (sum, a) => sum + Math.abs(a.balance),
                0,
            );

            const percentage =
                absoluteTotal > 0
                    ? (absCategoryValue / absoluteTotal) * 100
                    : 0;

            const accountsWithStats = accounts
                .map((a) => ({
                    ...a,
                    percentageOfCategory:
                        absCategoryValue > 0
                            ? (Math.abs(a.balance) / absCategoryValue) * 100
                            : 0,
                }))
                .sort((a, b) => b.balance - a.balance);

            return {
                type,
                accounts: accountsWithStats,
                value,
                percentage,
            };
        })
        .sort((a, b) => {
            const orderA = CATEGORY_ORDER[a.type] ?? 99;
            const orderB = CATEGORY_ORDER[b.type] ?? 99;
            return orderA - orderB;
        });
}

export function mergeAccountEvolutionSeries(
    seriesByAccount: Record<string, AccountBalanceEvolutionPoint[]>,
): AccountBalanceEvolutionPoint[] {
    const map = new Map<string, number>();

    for (const series of Object.values(seriesByAccount)) {
        for (const point of series) {
            map.set(point.date, (map.get(point.date) || 0) + point.balance);
        }
    }

    const merged = Array.from(map.entries()).map(([date, balance]) => ({
        date,
        balance,
    }));

    return merged.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
}
