import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";
import {i18nT} from "~/utils/i18n";

export type BudgetedFilter = "all" | "budgeted" | "unbudgeted";
export type ReportResolution = "day" | "week" | "month" | "quarter" | "year";

export type ReportFilters = {
    startDate: string;
    endDate: string;
    accountIds?: string[];
    categoryIds?: string[];
    merchantIds?: string[];
    includeShared?: boolean;
    excludeTransfers?: boolean;
    includeRebalances?: boolean;
    budgeted?: BudgetedFilter;
    resolution?: ReportResolution;
};

export type ReportKpiPeriod = {
    income: number;
    expense: number;
    net: number;
    savingsRate: number;
    transactionCount: number;
};

export type ReportKpi = {
    current: ReportKpiPeriod;
    previous: ReportKpiPeriod;
};

export type CashFlowPoint = {
    period: string;
    income: number;
    expense: number;
    net: number;
};

export type CashFlowSankeyNode = {
    id: string;
    label: string;
    kind: "income" | "expense" | "hub" | "savings" | "deficit";
    hexColor?: string;
    icon?: string;
};

export type CashFlowSankeyLink = {
    source: string;
    target: string;
    value: number;
};

export type CashFlowSankey = {
    nodes: CashFlowSankeyNode[];
    links: CashFlowSankeyLink[];
    totals: {income: number; expense: number; net: number};
};

export type CategoryBreakdown = {
    categoryId: string | null;
    name: string;
    hexColor: string;
    icon: string;
    spent: number;
    count: number;
};

export type CategoryTrendCategory = {
    categoryId: string | null;
    name: string;
    hexColor: string;
    icon: string;
    total: number;
};

export type CategoryTrendPoint = {
    period: string;
    spentByCategoryId: Record<string, number>;
};

export type CategoryTrend = {
    categories: CategoryTrendCategory[];
    points: CategoryTrendPoint[];
};

export type MerchantBreakdown = {
    merchantId: string | null;
    name: string;
    spent: number;
    count: number;
};

export type AccountBreakdown = {
    accountId: string;
    name: string;
    type: string;
    ownerId: string;
    ownerUsername: string;
    access: "owner" | "write" | "read";
    balance: number;
    income: number;
    expense: number;
};

export type NetWorthPoint = {
    date: string;
    total: number;
    byType: Record<string, number>;
};

export type BudgetVsActualPoint = {
    year: number;
    month: number;
    period: string;
    budgetedIncome: number;
    budgetedExpense: number;
    actualIncome: number;
    actualExpense: number;
};

function buildQuery(filters: ReportFilters, extras: Record<string, string | number | undefined> = {}): string {
    const params = new URLSearchParams();
    params.set("startDate", filters.startDate);
    params.set("endDate", filters.endDate);
    if (filters.accountIds && filters.accountIds.length > 0) {
        params.set("accountIds", filters.accountIds.join(","));
    }
    if (filters.categoryIds && filters.categoryIds.length > 0) {
        params.set("categoryIds", filters.categoryIds.join(","));
    }
    if (filters.merchantIds && filters.merchantIds.length > 0) {
        params.set("merchantIds", filters.merchantIds.join(","));
    }
    if (filters.includeShared !== undefined) {
        params.set("includeShared", String(filters.includeShared));
    }
    if (filters.excludeTransfers) {
        params.set("excludeTransfers", "true");
    }
    if (filters.includeRebalances) {
        params.set("includeRebalances", "true");
    }
    if (filters.budgeted && filters.budgeted !== "all") {
        params.set("budgeted", filters.budgeted);
    }
    if (filters.resolution) {
        params.set("resolution", filters.resolution);
    }
    for (const [key, value] of Object.entries(extras)) {
        if (value !== undefined) params.set(key, String(value));
    }
    return params.toString();
}

async function apiGet<T>(endpoint: string): Promise<T> {
    const userStore = useUserStore();
    if (!userStore.token) throw new Error("No token available");
    const {apiFetch} = useApi();

    try {
        return await apiFetch<T>(endpoint);
    } catch (err: any) {
        const message = err?.data?.message ?? err?.message ?? i18nT("reports.store.errors.fetch");
        toast.error(message);
        throw new Error(message, {cause: err});
    }
}

export const useReportStore = defineStore("report", {
    state: () => ({}),

    actions: {
        async fetchKpis(filters: ReportFilters): Promise<ReportKpi> {
            return apiGet<ReportKpi>(`/report/kpis?${buildQuery(filters)}`);
        },

        async fetchCashFlow(filters: ReportFilters): Promise<CashFlowPoint[]> {
            return apiGet<CashFlowPoint[]>(`/report/cash-flow?${buildQuery(filters)}`);
        },

        async fetchCashFlowSankey(filters: ReportFilters): Promise<CashFlowSankey> {
            return apiGet<CashFlowSankey>(`/report/cash-flow-sankey?${buildQuery(filters)}`);
        },

        async fetchByCategory(filters: ReportFilters): Promise<CategoryBreakdown[]> {
            return apiGet<CategoryBreakdown[]>(`/report/by-category?${buildQuery(filters)}`);
        },

        async fetchCategoryTrend(filters: ReportFilters): Promise<CategoryTrend> {
            return apiGet<CategoryTrend>(`/report/category-trend?${buildQuery(filters)}`);
        },

        async fetchByMerchant(filters: ReportFilters, limit = 10): Promise<MerchantBreakdown[]> {
            return apiGet<MerchantBreakdown[]>(`/report/by-merchant?${buildQuery(filters, {limit})}`);
        },

        async fetchByAccount(filters: ReportFilters): Promise<AccountBreakdown[]> {
            return apiGet<AccountBreakdown[]>(`/report/by-account?${buildQuery(filters)}`);
        },

        async fetchNetWorth(filters: ReportFilters): Promise<NetWorthPoint[]> {
            return apiGet<NetWorthPoint[]>(`/report/net-worth?${buildQuery(filters)}`);
        },

        async fetchBudgetVsActual(filters: ReportFilters): Promise<BudgetVsActualPoint[]> {
            return apiGet<BudgetVsActualPoint[]>(`/report/budget-vs-actual?${buildQuery(filters)}`);
        },
    },
});
