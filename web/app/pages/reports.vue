<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useAccountStore} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import {
    type AccountBreakdown,
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
import {buildReportDateRange, type ReportRange} from "~/utils/reports";
import ReportFiltersBar from "~/components/reports/ReportFiltersBar.vue";
import ReportKpiCards from "~/components/reports/ReportKpiCards.vue";
import ReportChartCard from "~/components/reports/ReportChartCard.vue";
import NetWorthChart from "~/components/reports/NetWorthChart.vue";
import CashFlowChart from "~/components/reports/CashFlowChart.vue";
import CashFlowSankeyChart from "~/components/reports/CashFlowSankeyChart.vue";
import CategoryDonutChart from "~/components/reports/CategoryDonutChart.vue";
import CategoryTrendChart from "~/components/reports/CategoryTrendChart.vue";
import TopMerchantsChart from "~/components/reports/TopMerchantsChart.vue";
import AccountDistributionChart from "~/components/reports/AccountDistributionChart.vue";
import BudgetVsActualChart from "~/components/reports/BudgetVsActualChart.vue";
import SavingsRateChart from "~/components/reports/SavingsRateChart.vue";

const {t} = useI18n();
const route = useRoute();
const router = useRouter();

const accountStore = useAccountStore();
const familyStore = useFamilyStore();
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

function parseAccountIdsQuery(value: unknown): string[] {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== "string" || raw.length === 0) return [];
    return raw.split(",").filter((v) => v.length > 0);
}

function parseIncludeShared(value: unknown): boolean {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === "false" || raw === "0") return false;
    return true;
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
const accountIds = ref<string[]>(parseAccountIdsQuery(route.query.accountIds));
const includeShared = ref<boolean>(parseIncludeShared(route.query.includeShared));

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

const isLoading = ref(true);
const latestRequestId = ref(0);

function currentFilters() {
    return {
        startDate: startDate.value,
        endDate: endDate.value,
        accountIds: accountIds.value.length > 0 ? accountIds.value : undefined,
        includeShared: includeShared.value,
    };
}

async function loadAllReports() {
    const requestId = ++latestRequestId.value;
    isLoading.value = true;

    const filters = currentFilters();
    try {
        const emptySankey: CashFlowSankey = {nodes: [], links: [], totals: {income: 0, expense: 0, net: 0}};
        const [
            kpisRes,
            cashFlowRes,
            sankeyRes,
            byCategoryRes,
            trendRes,
            merchantsRes,
            byAccountRes,
            netWorthRes,
            budgetVsActualRes,
        ] = await Promise.all([
            reportStore.fetchKpis(filters).catch(() => null),
            reportStore.fetchCashFlow(filters).catch(() => []),
            reportStore.fetchCashFlowSankey(filters).catch(() => emptySankey),
            reportStore.fetchByCategory(filters).catch(() => []),
            reportStore.fetchCategoryTrend(filters).catch(() => ({categories: [], points: []})),
            reportStore.fetchByMerchant(filters, 10).catch(() => []),
            reportStore.fetchByAccount(filters).catch(() => []),
            reportStore.fetchNetWorth(filters).catch(() => []),
            reportStore.fetchBudgetVsActual(filters).catch(() => []),
        ]);

        if (requestId !== latestRequestId.value) return;

        kpis.value = kpisRes;
        cashFlow.value = cashFlowRes;
        cashFlowSankey.value = sankeyRes;
        byCategory.value = byCategoryRes;
        categoryTrend.value = trendRes;
        topMerchants.value = merchantsRes;
        byAccount.value = byAccountRes;
        netWorth.value = netWorthRes;
        budgetVsActual.value = budgetVsActualRes;
    } finally {
        if (requestId === latestRequestId.value) isLoading.value = false;
    }
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
    if (!includeShared.value) query.includeShared = "false";
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

watch([range, startDate, endDate, accountIds, includeShared], () => {
    scheduleReload();
});

onMounted(async () => {
    await Promise.all([accountStore.fetchAccounts(), familyStore.fetchFamily()]);
    await loadAllReports();
});

const hasAccounts = computed(() => accountStore.accounts.length > 0);
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
                    v-if="!isLoading && !hasAccounts"
                    class="border-border/60 bg-brand-gradient-soft/30 flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
                    <Icon class="text-primary mb-3 size-10" name="iconoir:stats-report" />
                    <h3 class="font-heading text-xl font-semibold">{{ t("reports.empty.noAccountsTitle") }}</h3>
                    <p class="text-muted-foreground mt-2 max-w-md text-sm">
                        {{ t("reports.empty.noAccountsDescription") }}
                    </p>
                </div>

                <template v-else>
                    <ReportFiltersBar
                        :account-ids="accountIds"
                        :accounts="accountStore.accounts"
                        :end-date="endDate"
                        :include-shared="includeShared"
                        :loading="isLoading"
                        :range="range"
                        :start-date="startDate"
                        @update:range="(v) => (range = v)"
                        @update:start-date="(v) => (startDate = v)"
                        @update:end-date="(v) => (endDate = v)"
                        @update:account-ids="(v) => (accountIds = v)"
                        @update:include-shared="(v) => (includeShared = v)" />

                    <ReportKpiCards :currency="currency" :data="kpis" :loading="isLoading" />

                    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <ReportChartCard
                            :empty="!isLoading && netWorth.length === 0"
                            :empty-message="t('reports.empty.noData')"
                            :loading="isLoading"
                            :subtitle="t('reports.charts.netWorth.subtitle')"
                            :title="t('reports.charts.netWorth.title')"
                            class="lg:col-span-2"
                            icon="iconoir:graph-up">
                            <NetWorthChart :currency="currency" :data="netWorth" />
                        </ReportChartCard>

                        <ReportChartCard
                            :empty="!isLoading && cashFlow.length === 0"
                            :empty-message="t('reports.empty.noData')"
                            :loading="isLoading"
                            :subtitle="t('reports.charts.cashFlow.subtitle')"
                            :title="t('reports.charts.cashFlow.title')"
                            class="lg:col-span-2"
                            icon="iconoir:data-transfer-both">
                            <CashFlowChart :currency="currency" :data="cashFlow" />
                        </ReportChartCard>

                        <ReportChartCard
                            :empty="!isLoading && cashFlowSankey.links.length === 0"
                            :empty-message="t('reports.empty.noData')"
                            :loading="isLoading"
                            :subtitle="t('reports.charts.cashFlowSankey.subtitle')"
                            :title="t('reports.charts.cashFlowSankey.title')"
                            class="lg:col-span-2"
                            icon="iconoir:git-fork">
                            <CashFlowSankeyChart :currency="currency" :data="cashFlowSankey" />
                        </ReportChartCard>

                        <ReportChartCard
                            :empty="!isLoading && byCategory.length === 0"
                            :empty-message="t('reports.empty.noSpending')"
                            :loading="isLoading"
                            :subtitle="t('reports.charts.byCategory.subtitle')"
                            :title="t('reports.charts.byCategory.title')"
                            icon="iconoir:pizza-slice">
                            <CategoryDonutChart :currency="currency" :data="byCategory" />
                        </ReportChartCard>

                        <ReportChartCard
                            :empty="!isLoading && topMerchants.length === 0"
                            :empty-message="t('reports.empty.noSpending')"
                            :loading="isLoading"
                            :subtitle="t('reports.charts.topMerchants.subtitle')"
                            :title="t('reports.charts.topMerchants.title')"
                            icon="iconoir:shop">
                            <TopMerchantsChart :currency="currency" :data="topMerchants" />
                        </ReportChartCard>

                        <ReportChartCard
                            :empty="!isLoading && categoryTrend.points.length === 0"
                            :empty-message="t('reports.empty.noData')"
                            :loading="isLoading"
                            :subtitle="t('reports.charts.categoryTrend.subtitle')"
                            :title="t('reports.charts.categoryTrend.title')"
                            class="lg:col-span-2"
                            icon="iconoir:stats-up-square">
                            <CategoryTrendChart :currency="currency" :data="categoryTrend" />
                        </ReportChartCard>

                        <ReportChartCard
                            :empty="!isLoading && budgetVsActual.length === 0"
                            :empty-message="t('reports.empty.noBudgets')"
                            :loading="isLoading"
                            :subtitle="t('reports.charts.budgetVsActual.subtitle')"
                            :title="t('reports.charts.budgetVsActual.title')"
                            icon="iconoir:piggy-bank">
                            <BudgetVsActualChart :currency="currency" :data="budgetVsActual" />
                        </ReportChartCard>

                        <ReportChartCard
                            :empty="!isLoading && byAccount.length === 0"
                            :empty-message="t('reports.empty.noData')"
                            :loading="isLoading"
                            :subtitle="t('reports.charts.byAccount.subtitle')"
                            :title="t('reports.charts.byAccount.title')"
                            icon="iconoir:wallet">
                            <AccountDistributionChart :currency="currency" :data="byAccount" />
                        </ReportChartCard>

                        <ReportChartCard
                            :empty="!isLoading && cashFlow.length === 0"
                            :empty-message="t('reports.empty.noData')"
                            :loading="isLoading"
                            :subtitle="t('reports.charts.savingsRate.subtitle')"
                            :title="t('reports.charts.savingsRate.title')"
                            class="lg:col-span-2"
                            icon="iconoir:coins">
                            <SavingsRateChart :data="cashFlow" />
                        </ReportChartCard>
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>
