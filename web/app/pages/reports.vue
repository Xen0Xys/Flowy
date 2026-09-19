<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {useAccountStore} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import {useReferenceStore} from "~/stores/reference.store";
import {
    type AccountBreakdown,
    type BudgetedFilter,
    type BudgetVsActualPoint,
    type CashFlowPoint,
    type CashFlowSankey,
    type CategoryBreakdown,
    type CategoryTrend,
    type MerchantBreakdown,
    type NetWorthPoint,
    type ReportKpi,
    useReportStore,
} from "~/stores/report.store";
import {buildReportDateRange, defaultResolutionFor, type ReportRange, type ReportResolution} from "~/utils/reports";
import ReportFiltersBar from "~/components/reports/ReportFiltersBar.vue";
import ReportFiltersSummary from "~/components/reports/ReportFiltersSummary.vue";
import ReportKpiCards from "~/components/reports/ReportKpiCards.vue";
import ReportChartCard from "~/components/reports/ReportChartCard.vue";
import ReportSection from "~/components/reports/ReportSection.vue";
import NetWorthChart from "~/components/reports/NetWorthChart.vue";
import CashFlowChart, {type CashFlowMode} from "~/components/reports/CashFlowChart.vue";
import CashFlowSankeyChart from "~/components/reports/CashFlowSankeyChart.vue";
import CategoryDonutChart from "~/components/reports/CategoryDonutChart.vue";
import CategoryTrendChart from "~/components/reports/CategoryTrendChart.vue";
import TopMerchantsChart from "~/components/reports/TopMerchantsChart.vue";
import AccountDistributionChart from "~/components/reports/AccountDistributionChart.vue";
import BudgetVsActualChart from "~/components/reports/BudgetVsActualChart.vue";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";

const {t} = useI18n();
const route = useRoute();
const router = useRouter();

const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const referenceStore = useReferenceStore();
const reportStore = useReportStore();

const currency = computed(() => familyStore.family?.currency ?? "USD");

// URL-synced state
function parseRange(value: unknown): ReportRange {
    const raw = Array.isArray(value) ? value[0] : value;
    if (
        raw === "7D" ||
        raw === "1M" ||
        raw === "3M" ||
        raw === "6M" ||
        raw === "1Y" ||
        raw === "YTD" ||
        raw === "ALL" ||
        raw === "CUSTOM"
    ) {
        return raw;
    }
    return "1M";
}

function parseIdListQuery(value: unknown): string[] {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== "string" || raw.length === 0) return [];
    return raw.split(",").filter((v) => v.length > 0);
}

function parseIncludeShared(value: unknown): boolean {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === "false" || raw === "0") return false;
    return true;
}

function parseBooleanQuery(value: unknown): boolean {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw === "true" || raw === "1";
}

function parseBudgeted(value: unknown): BudgetedFilter {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === "budgeted" || raw === "unbudgeted") return raw;
    return "all";
}

function parseResolution(value: unknown): ReportResolution | null {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === "day" || raw === "week" || raw === "month" || raw === "quarter" || raw === "year") {
        return raw;
    }
    return null;
}

const initialRange = parseRange(route.query.range);
const initialCustom =
    initialRange === "CUSTOM"
        ? {
              startDate: typeof route.query.start === "string" ? route.query.start : "",
              endDate: typeof route.query.end === "string" ? route.query.end : "",
          }
        : null;

const range = ref<ReportRange>(initialRange);
const {startDate: defaultStart, endDate: defaultEnd} = buildReportDateRange(
    initialRange === "CUSTOM" ? "1M" : initialRange,
);
const startDate = ref<string>(initialCustom?.startDate || defaultStart);
const endDate = ref<string>(initialCustom?.endDate || defaultEnd);
const accountIds = ref<string[]>(parseIdListQuery(route.query.accountIds));
const categoryIds = ref<string[]>(parseIdListQuery(route.query.categoryIds));
const merchantIds = ref<string[]>(parseIdListQuery(route.query.merchantIds));
const includeShared = ref<boolean>(parseIncludeShared(route.query.includeShared));
const excludeTransfers = ref<boolean>(parseBooleanQuery(route.query.excludeTransfers));
const includeRebalances = ref<boolean>(parseBooleanQuery(route.query.includeRebalances));
const budgeted = ref<BudgetedFilter>(parseBudgeted(route.query.budgeted));
const resolutionOverride = ref<ReportResolution | null>(parseResolution(route.query.resolution));

const effectiveResolution = computed<ReportResolution>(
    () => resolutionOverride.value ?? defaultResolutionFor(range.value),
);

// Data buckets
const kpis = ref<ReportKpi | null>(null);
const cashFlow = ref<CashFlowPoint[]>([]);
const cashFlowSankey = ref<CashFlowSankey>({nodes: [], links: [], totals: {income: 0, expense: 0, net: 0}});
const byCategory = ref<CategoryBreakdown[]>([]);
const categoryTrend = ref<CategoryTrend>({categories: [], points: []});
const topMerchants = ref<MerchantBreakdown[]>([]);
const byAccount = ref<AccountBreakdown[]>([]);
const netWorth = ref<NetWorthPoint[]>([]);
const budgetVsActual = ref<BudgetVsActualPoint[]>([]);

// Per-card loading state so cards render progressively as each request settles.
const kpisLoading = ref(true);
const cashFlowLoading = ref(true);
const cashFlowSankeyLoading = ref(true);
const byCategoryLoading = ref(true);
const categoryTrendLoading = ref(true);
const topMerchantsLoading = ref(true);
const byAccountLoading = ref(true);
const netWorthLoading = ref(true);
const budgetVsActualLoading = ref(true);

const isAnyLoading = computed(
    () =>
        kpisLoading.value ||
        cashFlowLoading.value ||
        cashFlowSankeyLoading.value ||
        byCategoryLoading.value ||
        categoryTrendLoading.value ||
        topMerchantsLoading.value ||
        byAccountLoading.value ||
        netWorthLoading.value ||
        budgetVsActualLoading.value,
);

const latestRequestId = ref(0);

function currentFilters() {
    return {
        startDate: startDate.value,
        endDate: endDate.value,
        accountIds: accountIds.value.length > 0 ? accountIds.value : undefined,
        categoryIds: categoryIds.value.length > 0 ? categoryIds.value : undefined,
        merchantIds: merchantIds.value.length > 0 ? merchantIds.value : undefined,
        includeShared: includeShared.value,
        excludeTransfers: excludeTransfers.value || undefined,
        includeRebalances: includeRebalances.value || undefined,
        budgeted: budgeted.value !== "all" ? budgeted.value : undefined,
        resolution: effectiveResolution.value,
    };
}

async function fetchInto<T>(
    requestId: number,
    dataRef: {value: T},
    loadingRef: {value: boolean},
    fetcher: () => Promise<T>,
    fallback: T,
): Promise<void> {
    loadingRef.value = true;
    try {
        const result = await fetcher();
        if (requestId !== latestRequestId.value) return;
        dataRef.value = result;
    } catch {
        if (requestId !== latestRequestId.value) return;
        dataRef.value = fallback;
    } finally {
        if (requestId === latestRequestId.value) loadingRef.value = false;
    }
}

function loadAllReports(): void {
    const requestId = ++latestRequestId.value;
    const filters = currentFilters();
    const emptySankey: CashFlowSankey = {nodes: [], links: [], totals: {income: 0, expense: 0, net: 0}};

    fetchInto(requestId, kpis, kpisLoading, () => reportStore.fetchKpis(filters), null);
    fetchInto(requestId, cashFlow, cashFlowLoading, () => reportStore.fetchCashFlow(filters), []);
    fetchInto(
        requestId,
        cashFlowSankey,
        cashFlowSankeyLoading,
        () => reportStore.fetchCashFlowSankey(filters),
        emptySankey,
    );
    fetchInto(requestId, byCategory, byCategoryLoading, () => reportStore.fetchByCategory(filters), []);
    fetchInto(requestId, categoryTrend, categoryTrendLoading, () => reportStore.fetchCategoryTrend(filters), {
        categories: [],
        points: [],
    });
    fetchInto(requestId, topMerchants, topMerchantsLoading, () => reportStore.fetchByMerchant(filters, 10), []);
    fetchInto(requestId, byAccount, byAccountLoading, () => reportStore.fetchByAccount(filters), []);
    fetchInto(requestId, netWorth, netWorthLoading, () => reportStore.fetchNetWorth(filters), []);
    fetchInto(requestId, budgetVsActual, budgetVsActualLoading, () => reportStore.fetchBudgetVsActual(filters), []);
}

function syncQuery() {
    const query: Record<string, string> = {
        range: range.value,
    };
    if (range.value === "CUSTOM") {
        query.start = startDate.value;
        query.end = endDate.value;
    }
    if (accountIds.value.length > 0) query.accountIds = accountIds.value.join(",");
    if (categoryIds.value.length > 0) query.categoryIds = categoryIds.value.join(",");
    if (merchantIds.value.length > 0) query.merchantIds = merchantIds.value.join(",");
    if (!includeShared.value) query.includeShared = "false";
    if (excludeTransfers.value) query.excludeTransfers = "true";
    if (includeRebalances.value) query.includeRebalances = "true";
    if (budgeted.value !== "all") query.budgeted = budgeted.value;
    if (resolutionOverride.value !== null) query.resolution = resolutionOverride.value;
    router.replace({query});
}

let debounceHandle: ReturnType<typeof setTimeout> | null = null;
function scheduleReload() {
    if (debounceHandle !== null) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => {
        syncQuery();
        loadAllReports();
    }, 200);
}

watch(
    [
        range,
        startDate,
        endDate,
        accountIds,
        categoryIds,
        merchantIds,
        includeShared,
        excludeTransfers,
        includeRebalances,
        budgeted,
        resolutionOverride,
    ],
    () => {
        scheduleReload();
    },
);

const hasActiveFilters = computed(
    () =>
        accountIds.value.length > 0 ||
        categoryIds.value.length > 0 ||
        merchantIds.value.length > 0 ||
        !includeShared.value ||
        excludeTransfers.value ||
        includeRebalances.value ||
        budgeted.value !== "all",
);

function resetAllFilters() {
    accountIds.value = [];
    categoryIds.value = [];
    merchantIds.value = [];
    includeShared.value = true;
    excludeTransfers.value = false;
    includeRebalances.value = false;
    budgeted.value = "all";
}

function drillDownCategory(id: string | null) {
    if (id === null) return;
    if (categoryIds.value.includes(id)) return;
    const previous = [...categoryIds.value];
    const category = referenceStore.categories.find((c) => c.id === id);
    categoryIds.value = [...previous, id];
    toast.success(t("reports.drilldown.categoryApplied", {name: category?.name ?? id}), {
        action: {
            label: t("reports.drilldown.undo"),
            onClick: () => {
                categoryIds.value = previous;
            },
        },
    });
}

function drillDownMerchant(id: string | null) {
    if (id === null) return;
    if (merchantIds.value.includes(id)) return;
    const previous = [...merchantIds.value];
    const merchant = referenceStore.merchants.find((m) => m.id === id);
    merchantIds.value = [...previous, id];
    toast.success(t("reports.drilldown.merchantApplied", {name: merchant?.name ?? id}), {
        action: {
            label: t("reports.drilldown.undo"),
            onClick: () => {
                merchantIds.value = previous;
            },
        },
    });
}

onMounted(async () => {
    await Promise.all([accountStore.fetchAccounts(), familyStore.fetchFamily(), referenceStore.fetchReferences()]);
    loadAllReports();
});

const hasAccounts = computed(() => accountStore.accounts.length > 0);

const cashFlowMode = ref<CashFlowMode>("flow");
</script>

<template>
    <div class="w-full">
        <div class="mx-auto max-w-7xl">
            <div class="flex flex-col gap-6">
                <!-- Header -->
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div class="flex items-center gap-3">
                        <div class="relative">
                            <span
                                aria-hidden="true"
                                class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
                            <div
                                class="bg-brand-gradient-soft border-border/60 relative flex size-12 items-center justify-center rounded-xl border">
                                <Icon class="text-primary size-6" name="iconoir:stats-report" />
                            </div>
                        </div>
                        <div>
                            <h1 class="font-heading text-2xl font-semibold tracking-tight">
                                {{ t("reports.title") }}
                            </h1>
                            <p class="text-muted-foreground text-sm">{{ t("reports.subtitle") }}</p>
                        </div>
                    </div>
                </div>

                <!-- Empty state when user has no accounts -->
                <div
                    v-if="!isAnyLoading && !hasAccounts"
                    class="border-border/60 bg-brand-gradient-soft/30 flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
                    <Icon class="text-primary mb-3 size-10" name="iconoir:stats-report" />
                    <h3 class="font-heading text-xl font-semibold">{{ t("reports.empty.noAccountsTitle") }}</h3>
                    <p class="text-muted-foreground mt-2 max-w-md text-sm">
                        {{ t("reports.empty.noAccountsDescription") }}
                    </p>
                </div>

                <template v-else>
                    <div class="bg-background/80 sticky top-0 z-30 -mx-4 flex flex-col gap-2 px-4 py-2 backdrop-blur">
                        <ReportFiltersBar
                            :account-ids="accountIds"
                            :accounts="accountStore.accounts"
                            :budgeted="budgeted"
                            :categories="referenceStore.categories"
                            :category-ids="categoryIds"
                            :effective-resolution="effectiveResolution"
                            :end-date="endDate"
                            :exclude-transfers="excludeTransfers"
                            :include-rebalances="includeRebalances"
                            :include-shared="includeShared"
                            :loading="isAnyLoading"
                            :merchant-ids="merchantIds"
                            :merchants="referenceStore.merchants"
                            :range="range"
                            :resolution-override="resolutionOverride"
                            :start-date="startDate"
                            @update:range="(v) => (range = v)"
                            @update:start-date="(v) => (startDate = v)"
                            @update:end-date="(v) => (endDate = v)"
                            @update:account-ids="(v) => (accountIds = v)"
                            @update:category-ids="(v) => (categoryIds = v)"
                            @update:merchant-ids="(v) => (merchantIds = v)"
                            @update:include-shared="(v) => (includeShared = v)"
                            @update:exclude-transfers="(v) => (excludeTransfers = v)"
                            @update:include-rebalances="(v) => (includeRebalances = v)"
                            @update:budgeted="(v) => (budgeted = v)"
                            @update:resolution-override="(v) => (resolutionOverride = v)" />

                        <ReportFiltersSummary
                            v-if="hasActiveFilters"
                            :account-ids="accountIds"
                            :accounts="accountStore.accounts"
                            :budgeted="budgeted"
                            :categories="referenceStore.categories"
                            :category-ids="categoryIds"
                            :exclude-transfers="excludeTransfers"
                            :include-rebalances="includeRebalances"
                            :include-shared="includeShared"
                            :merchant-ids="merchantIds"
                            :merchants="referenceStore.merchants"
                            @remove:account="(id) => (accountIds = accountIds.filter((x) => x !== id))"
                            @remove:category="(id) => (categoryIds = categoryIds.filter((x) => x !== id))"
                            @remove:merchant="(id) => (merchantIds = merchantIds.filter((x) => x !== id))"
                            @reset:include-shared="includeShared = true"
                            @reset:exclude-transfers="excludeTransfers = false"
                            @reset:include-rebalances="includeRebalances = false"
                            @reset:budgeted="budgeted = 'all'"
                            @reset:all="resetAllFilters" />
                    </div>

                    <ReportSection
                        :title="t('reports.sections.overview.title')"
                        :subtitle="t('reports.sections.overview.subtitle')"
                        icon="iconoir:reports">
                        <ReportKpiCards :currency="currency" :data="kpis" :loading="kpisLoading" />

                        <ReportChartCard
                            :empty="!netWorthLoading && netWorth.length === 0"
                            :empty-action="
                                hasActiveFilters
                                    ? {label: t('reports.filters.resetAll'), onClick: resetAllFilters}
                                    : undefined
                            "
                            :empty-message="t('reports.empty.noData')"
                            :loading="netWorthLoading"
                            :subtitle="t('reports.charts.netWorth.subtitle')"
                            :title="t('reports.charts.netWorth.title')"
                            class="mt-4"
                            icon="iconoir:graph-up">
                            <NetWorthChart :currency="currency" :data="netWorth" />
                        </ReportChartCard>
                    </ReportSection>

                    <ReportSection
                        :title="t('reports.sections.flow.title')"
                        :subtitle="t('reports.sections.flow.subtitle')"
                        icon="iconoir:data-transfer-both">
                        <ReportChartCard
                            :empty="!cashFlowLoading && cashFlow.length === 0"
                            :empty-action="
                                hasActiveFilters
                                    ? {label: t('reports.filters.resetAll'), onClick: resetAllFilters}
                                    : undefined
                            "
                            :empty-message="t('reports.empty.noData')"
                            :loading="cashFlowLoading"
                            :subtitle="
                                cashFlowMode === 'savings'
                                    ? t('reports.charts.cashFlow.subtitleSavings')
                                    : t('reports.charts.cashFlow.subtitle')
                            "
                            :title="
                                cashFlowMode === 'savings'
                                    ? t('reports.charts.cashFlow.titleSavings')
                                    : t('reports.charts.cashFlow.title')
                            "
                            :icon="cashFlowMode === 'savings' ? 'iconoir:coins' : 'iconoir:data-transfer-both'">
                            <template #actions>
                                <Tabs
                                    :model-value="cashFlowMode"
                                    @update:model-value="(v) => v && (cashFlowMode = v as CashFlowMode)">
                                    <TabsList class="h-8">
                                        <TabsTrigger value="flow" class="text-xs">
                                            {{ t("reports.charts.cashFlow.modeFlow") }}
                                        </TabsTrigger>
                                        <TabsTrigger value="savings" class="text-xs">
                                            {{ t("reports.charts.cashFlow.modeSavings") }}
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </template>
                            <CashFlowChart
                                :currency="currency"
                                :data="cashFlow"
                                :mode="cashFlowMode"
                                :resolution="effectiveResolution" />
                        </ReportChartCard>

                        <ReportChartCard
                            :empty="!cashFlowSankeyLoading && cashFlowSankey.links.length === 0"
                            :empty-action="
                                hasActiveFilters
                                    ? {label: t('reports.filters.resetAll'), onClick: resetAllFilters}
                                    : undefined
                            "
                            :empty-message="t('reports.empty.noData')"
                            :loading="cashFlowSankeyLoading"
                            :subtitle="t('reports.charts.cashFlowSankey.subtitle')"
                            :title="t('reports.charts.cashFlowSankey.title')"
                            class="mt-4"
                            icon="iconoir:git-fork">
                            <CashFlowSankeyChart :currency="currency" :data="cashFlowSankey" />
                        </ReportChartCard>
                    </ReportSection>

                    <ReportSection
                        :title="t('reports.sections.breakdown.title')"
                        :subtitle="t('reports.sections.breakdown.subtitle')"
                        icon="iconoir:pizza-slice">
                        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <ReportChartCard
                                :empty="!byCategoryLoading && byCategory.length === 0"
                                :empty-action="
                                    hasActiveFilters
                                        ? {label: t('reports.filters.resetAll'), onClick: resetAllFilters}
                                        : undefined
                                "
                                :empty-message="t('reports.empty.noSpending')"
                                :loading="byCategoryLoading"
                                :subtitle="t('reports.charts.byCategory.subtitle')"
                                :title="t('reports.charts.byCategory.title')"
                                icon="iconoir:pizza-slice">
                                <CategoryDonutChart
                                    :currency="currency"
                                    :data="byCategory"
                                    @select="drillDownCategory" />
                            </ReportChartCard>

                            <ReportChartCard
                                :empty="!topMerchantsLoading && topMerchants.length === 0"
                                :empty-action="
                                    hasActiveFilters
                                        ? {label: t('reports.filters.resetAll'), onClick: resetAllFilters}
                                        : undefined
                                "
                                :empty-message="t('reports.empty.noSpending')"
                                :loading="topMerchantsLoading"
                                :subtitle="t('reports.charts.topMerchants.subtitle')"
                                :title="t('reports.charts.topMerchants.title')"
                                icon="iconoir:shop">
                                <TopMerchantsChart
                                    :currency="currency"
                                    :data="topMerchants"
                                    @select="drillDownMerchant" />
                            </ReportChartCard>
                        </div>

                        <ReportChartCard
                            :empty="!categoryTrendLoading && categoryTrend.points.length === 0"
                            :empty-action="
                                hasActiveFilters
                                    ? {label: t('reports.filters.resetAll'), onClick: resetAllFilters}
                                    : undefined
                            "
                            :empty-message="t('reports.empty.noData')"
                            :loading="categoryTrendLoading"
                            :subtitle="t('reports.charts.categoryTrend.subtitle')"
                            :title="t('reports.charts.categoryTrend.title')"
                            class="mt-4"
                            icon="iconoir:stats-up-square">
                            <CategoryTrendChart
                                :currency="currency"
                                :data="categoryTrend"
                                :resolution="effectiveResolution" />
                        </ReportChartCard>
                    </ReportSection>

                    <ReportSection
                        :title="t('reports.sections.budgetAccounts.title')"
                        :subtitle="t('reports.sections.budgetAccounts.subtitle')"
                        icon="iconoir:piggy-bank">
                        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <ReportChartCard
                                :empty="!budgetVsActualLoading && budgetVsActual.length === 0"
                                :empty-message="t('reports.empty.noBudgets')"
                                :loading="budgetVsActualLoading"
                                :subtitle="t('reports.charts.budgetVsActual.subtitle')"
                                :title="t('reports.charts.budgetVsActual.title')"
                                icon="iconoir:piggy-bank">
                                <BudgetVsActualChart :currency="currency" :data="budgetVsActual" />
                            </ReportChartCard>

                            <ReportChartCard
                                :empty="!byAccountLoading && byAccount.length === 0"
                                :empty-action="
                                    hasActiveFilters
                                        ? {label: t('reports.filters.resetAll'), onClick: resetAllFilters}
                                        : undefined
                                "
                                :empty-message="t('reports.empty.noData')"
                                :loading="byAccountLoading"
                                :subtitle="t('reports.charts.byAccount.subtitle')"
                                :title="t('reports.charts.byAccount.title')"
                                icon="iconoir:wallet">
                                <AccountDistributionChart :currency="currency" :data="byAccount" />
                            </ReportChartCard>
                        </div>
                    </ReportSection>
                </template>
            </div>
        </div>
    </div>
</template>
