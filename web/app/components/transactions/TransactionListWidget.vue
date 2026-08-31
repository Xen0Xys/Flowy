<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useIntersectionObserver, watchDebounced} from "@vueuse/core";
import {CalendarDate} from "@internationalized/date";
import type {SortingState} from "@tanstack/vue-table";
import {useI18n} from "vue-i18n";
import type {LocationQueryRaw} from "vue-router";
import {
    type SearchTransactionsResult,
    type Transaction,
    type TransactionSearchFilters,
    type TransactionSortBy,
    type TransactionSummary,
    useTransactionStore,
} from "~/stores/transaction.store";
import {useReferenceStore} from "~/stores/reference.store";
import {useFamilyStore} from "~/stores/family.store";
import {toCurrency} from "~/lib/currency";
import TransactionTable from "~/components/transactions/TransactionTable.vue";
import TransactionFormModal from "~/components/transactions/TransactionFormModal.vue";
import TransactionFiltersBar, {type TransactionFilters} from "~/components/transactions/TransactionFiltersBar.vue";
import {Button} from "~/components/ui/button";
import {ScrollArea} from "~/components/ui/scroll-area";
import {Skeleton} from "~/components/ui/skeleton";
import {NuxtLink} from "#components";

const SORTABLE_COLUMNS: readonly TransactionSortBy[] = ["date", "description", "amount", "category", "account"];
const DEFAULT_SORT_ID: TransactionSortBy = "date";
const DEFAULT_SORT_DESC = true;
const isSortableColumn = (id: string): id is TransactionSortBy => (SORTABLE_COLUMNS as readonly string[]).includes(id);

const PAGE_SIZE = 25;

const props = defineProps<{
    accountId?: string;
    showViewAll?: boolean;
    viewAllLink?: string;
    showAccountColumn?: boolean;
    showAccountFilter?: boolean;
    availableAccounts?: {id: string; name: string}[];
}>();

const emit = defineEmits<{
    (e: "saved"): void;
}>();

const {t} = useI18n();
const transactionStore = useTransactionStore();
const referenceStore = useReferenceStore();
const familyStore = useFamilyStore();
const route = useRoute();
const router = useRouter();

const isTransactionModalOpen = ref(false);
const selectedTransaction = ref<Transaction | null>(null);

const filters = ref<TransactionFilters>({
    search: "",
    type: "all",
    accountId: "all",
    categoryId: "all",
    merchantId: "all",
    rebalance: "all",
    dateRange: {start: undefined, end: undefined},
});

const sorting = ref<SortingState>([{id: DEFAULT_SORT_ID, desc: DEFAULT_SORT_DESC}]);

let requestSeq = 0;
let lastSyncedQuery = "";
let hasMounted = false;

const availableCategories = computed(() =>
    referenceStore.categories
        .map((category) => ({id: category.id, name: category.name}))
        .sort((a, b) => a.name.localeCompare(b.name)),
);

const availableMerchants = computed(() =>
    referenceStore.merchants
        .map((merchant) => ({id: merchant.id, name: merchant.name}))
        .sort((a, b) => a.name.localeCompare(b.name)),
);

const accountNameById = computed(() => {
    return Object.fromEntries((props.availableAccounts || []).map((account) => [account.id, account.name]));
});

const searchResult = ref<SearchTransactionsResult>({
    items: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
});

const transactions = ref<Transaction[]>([]);
const currentPage = ref(1);
const isLoadingInitial = ref(false);
const isLoadingMore = ref(false);
const isRefreshPending = ref(false);
const loadMoreTrigger = ref<HTMLElement | null>(null);

const summary = ref<TransactionSummary | null>(null);
const isLoadingSummary = ref(false);

const isLoading = computed(() => isLoadingInitial.value || isLoadingMore.value || isRefreshPending.value);
const hasMorePages = computed(() => currentPage.value < (searchResult.value.totalPages ?? 1));

const formatCurrency = (value: number) => {
    const currency = familyStore.family?.currency || "USD";
    return toCurrency(value, currency);
};

const hasActiveFilters = computed(() => {
    const currentFilters = buildSearchFilters();
    const hasOtherFilters = Object.keys(currentFilters).some(
        (key) => key !== "accountId" && key !== "page" && key !== "pageSize",
    );
    const hasAccountFilter = !props.accountId && filters.value.accountId !== "all";
    return hasOtherFilters || hasAccountFilter;
});

const buildSearchFilters = (page = 1): TransactionSearchFilters => {
    const searchFilters: TransactionSearchFilters = {};

    if (props.accountId) {
        searchFilters.accountId = props.accountId;
    } else if (filters.value.accountId !== "all") {
        searchFilters.accountId = filters.value.accountId;
    }

    if (filters.value.search.trim()) {
        searchFilters.search = filters.value.search.trim();
    }

    if (filters.value.type !== "all") {
        searchFilters.type = filters.value.type;
    }

    if (filters.value.categoryId !== "all") {
        searchFilters.categoryId = filters.value.categoryId;
    }

    if (filters.value.merchantId !== "all") {
        searchFilters.merchantId = filters.value.merchantId;
    }

    if (filters.value.rebalance !== "all") {
        searchFilters.rebalance = filters.value.rebalance;
    }

    if (filters.value.dateRange.start) {
        const start = filters.value.dateRange.start as any;
        searchFilters.startDate = `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`;
    }

    if (filters.value.dateRange.end) {
        const end = filters.value.dateRange.end as any;
        searchFilters.endDate = `${end.year}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`;
    }

    const sort = sorting.value[0];
    if (sort && isSortableColumn(sort.id)) {
        searchFilters.sortBy = sort.id;
        searchFilters.sortOrder = sort.desc ? "desc" : "asc";
    }

    searchFilters.page = page;
    searchFilters.pageSize = PAGE_SIZE;

    return searchFilters;
};

const buildSummaryFilters = (): Omit<TransactionSearchFilters, "page" | "pageSize"> => {
    const {page: _page, pageSize: _pageSize, ...rest} = buildSearchFilters();
    return rest;
};

async function fetchTransactions(page = 1, append = false) {
    if (append && (!hasMorePages.value || isLoadingMore.value || isLoadingInitial.value)) {
        return;
    }

    const seq = append ? requestSeq : ++requestSeq;

    try {
        if (append) {
            isLoadingMore.value = true;
        } else {
            isLoadingInitial.value = true;
        }

        const searchFilters = buildSearchFilters(page);
        const nextResult = await transactionStore.searchTransactions(searchFilters);

        if (seq !== requestSeq) {
            return;
        }

        searchResult.value = nextResult;
        currentPage.value = nextResult.page;
        transactions.value = append ? [...transactions.value, ...nextResult.items] : nextResult.items;
    } catch (err) {
        console.error(err);
    } finally {
        if (seq === requestSeq) {
            if (append) {
                isLoadingMore.value = false;
            } else {
                isLoadingInitial.value = false;
            }
        }
    }
}

async function fetchSummary() {
    try {
        isLoadingSummary.value = true;
        summary.value = await transactionStore.fetchTransactionsSummary(buildSummaryFilters());
    } catch (err) {
        console.error(err);
    } finally {
        isLoadingSummary.value = false;
    }
}

const refreshFromFilters = () => {
    isRefreshPending.value = false;
    fetchTransactions(1, false);
    fetchSummary();
};

const fetchNextPage = () => {
    if (isRefreshPending.value) {
        return;
    }
    if (!hasMorePages.value) {
        return;
    }

    return fetchTransactions(currentPage.value + 1, true);
};

const parseCalendarDate = (value: string): CalendarDate | undefined => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return undefined;
    const [, year, month, day] = match;
    return new CalendarDate(Number(year), Number(month), Number(day));
};

const formatCalendarDate = (value: {year: number; month: number; day: number}): string => {
    return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
};

const serializeStateToQuery = (): Record<string, string> => {
    const q: Record<string, string> = {};
    const f = filters.value;

    if (f.search.trim()) q.search = f.search.trim();
    if (f.type !== "all") q.type = f.type;
    if (!props.accountId && f.accountId !== "all") q.accountId = f.accountId;
    if (f.categoryId !== "all") q.categoryId = f.categoryId;
    if (f.merchantId !== "all") q.merchantId = f.merchantId;
    if (f.rebalance !== "all") q.rebalance = f.rebalance;
    if (f.dateRange?.start) q.startDate = formatCalendarDate(f.dateRange.start as any);
    if (f.dateRange?.end) q.endDate = formatCalendarDate(f.dateRange.end as any);

    const sort = sorting.value[0];
    if (sort && isSortableColumn(sort.id)) {
        const isDefault = sort.id === DEFAULT_SORT_ID && sort.desc === DEFAULT_SORT_DESC;
        if (!isDefault) {
            q.sortBy = sort.id;
            q.sortOrder = sort.desc ? "desc" : "asc";
        }
    }

    return q;
};

const hydrateStateFromQuery = (query: typeof route.query) => {
    const getStr = (key: string): string | undefined => {
        const v = query[key];
        return typeof v === "string" && v.length > 0 ? v : undefined;
    };

    const next: TransactionFilters = {
        search: getStr("search") ?? "",
        type: (["income", "expense"] as const).includes(getStr("type") as any) ? (getStr("type") as any) : "all",
        accountId: !props.accountId ? (getStr("accountId") ?? "all") : "all",
        categoryId: getStr("categoryId") ?? "all",
        merchantId: getStr("merchantId") ?? "all",
        rebalance: (["only", "exclude"] as const).includes(getStr("rebalance") as any)
            ? (getStr("rebalance") as any)
            : "all",
        dateRange: {
            start: getStr("startDate") ? parseCalendarDate(getStr("startDate")!) : undefined,
            end: getStr("endDate") ? parseCalendarDate(getStr("endDate")!) : undefined,
        },
    };

    filters.value = next;

    const sortBy = getStr("sortBy");
    const sortOrder = getStr("sortOrder");
    if (sortBy && isSortableColumn(sortBy)) {
        sorting.value = [{id: sortBy, desc: sortOrder !== "asc"}];
    } else {
        sorting.value = [{id: DEFAULT_SORT_ID, desc: DEFAULT_SORT_DESC}];
    }
};

const TRACKED_QUERY_KEYS = [
    "search",
    "type",
    "accountId",
    "categoryId",
    "merchantId",
    "rebalance",
    "startDate",
    "endDate",
    "sortBy",
    "sortOrder",
] as const;

const stableQuerySignature = (q: Record<string, string | undefined>) =>
    TRACKED_QUERY_KEYS.map((key) => `${key}=${q[key] ?? ""}`).join("&");

const syncQueryToUrl = (serialized: Record<string, string>) => {
    const currentQuery = route.query;
    const preservedKeys = Object.keys(currentQuery).filter(
        (key) => !(TRACKED_QUERY_KEYS as readonly string[]).includes(key),
    );

    const merged: LocationQueryRaw = {...serialized};
    for (const key of preservedKeys) {
        merged[key] = currentQuery[key] as any;
    }

    const sameKeys =
        Object.keys(merged).length === Object.keys(currentQuery).length &&
        Object.keys(merged).every((key) => String(currentQuery[key] ?? "") === String(merged[key] ?? ""));

    if (sameKeys) return;

    router.replace({query: merged}).catch(() => {});
};

watch(
    [filters, sorting],
    () => {
        if (!hasMounted) return;
        const nextSignature = stableQuerySignature(serializeStateToQuery());
        if (nextSignature === lastSyncedQuery) return;
        transactions.value = [];
        summary.value = null;
        currentPage.value = 1;
        searchResult.value = {
            items: [],
            total: 0,
            page: 1,
            pageSize: PAGE_SIZE,
            totalPages: 1,
        };
        isLoadingMore.value = false;
        isRefreshPending.value = true;
        requestSeq++;
    },
    {deep: true, flush: "sync"},
);

watchDebounced(
    [filters, sorting],
    () => {
        const serialized = serializeStateToQuery();
        const signature = stableQuerySignature(serialized);
        if (signature === lastSyncedQuery && !isRefreshPending.value) return;
        lastSyncedQuery = signature;
        syncQueryToUrl(serialized);
        refreshFromFilters();
    },
    {debounce: 300, deep: true},
);

watch(
    () => route.query,
    (nextQuery) => {
        const currentQueryStr: Record<string, string | undefined> = {};
        for (const key of TRACKED_QUERY_KEYS) {
            const v = nextQuery[key];
            currentQueryStr[key] = typeof v === "string" ? v : undefined;
        }
        const incomingSignature = stableQuerySignature(currentQueryStr);
        if (incomingSignature === lastSyncedQuery) return;
        lastSyncedQuery = incomingSignature;
        hydrateStateFromQuery(nextQuery);
        refreshFromFilters();
    },
);

onMounted(() => {
    hydrateStateFromQuery(route.query);
    lastSyncedQuery = stableQuerySignature(serializeStateToQuery());

    referenceStore.fetchReferences().catch((err) => console.error(err));
    refreshFromFilters();
    hasMounted = true;

    if (!process.client) {
        return;
    }

    useIntersectionObserver(
        loadMoreTrigger,
        ([entry]) => {
            if (!entry?.isIntersecting) {
                return;
            }

            fetchNextPage();
        },
        {
            rootMargin: "250px 0px",
        },
    );
});

const handleNewTransactionClick = () => {
    selectedTransaction.value = null;
    isTransactionModalOpen.value = true;
};

const handleTransactionClick = (transaction: Transaction) => {
    selectedTransaction.value = transaction;
    isTransactionModalOpen.value = true;
};

const handleViewLinked = async (transactionId: string) => {
    try {
        const transaction = await transactionStore.fetchTransactionById(transactionId);
        if (transaction) {
            selectedTransaction.value = transaction;
            isTransactionModalOpen.value = true;
        }
    } catch (err) {
        console.error(err);
    }
};

const onTransactionSaved = () => {
    refreshFromFilters();
    emit("saved");
};

defineExpose({
    refreshTransactions: refreshFromFilters,
});
</script>

<template>
    <div class="bg-card text-card-foreground flex min-h-0 flex-1 flex-col rounded-xl border shadow-sm md:mb-6">
        <div class="p-6 pb-4">
            <div class="mb-4 flex shrink-0 items-center justify-between">
                <div class="flex items-center gap-4">
                    <h3 class="text-lg leading-none font-semibold tracking-tight">
                        {{ t("transactions.list.title") }}
                    </h3>
                    <NuxtLink
                        v-if="showViewAll && viewAllLink"
                        :to="viewAllLink"
                        class="text-muted-foreground hover:text-foreground text-sm hover:underline">
                        {{ t("transactions.list.viewAll") }}
                    </NuxtLink>
                </div>
                <template v-if="accountId">
                    <Button
                        :aria-label="t('transactions.list.newTransaction')"
                        class="shrink-0 md:hidden"
                        size="icon"
                        @click="handleNewTransactionClick">
                        <Icon class="h-4 w-4" name="iconoir:plus" />
                    </Button>
                    <Button class="hidden md:inline-flex" size="sm" @click="handleNewTransactionClick">
                        <Icon class="h-4 w-4" name="iconoir:plus" />
                        {{ t("transactions.list.newTransaction") }}
                    </Button>
                </template>
            </div>

            <TransactionFiltersBar
                v-model="filters"
                :available-accounts="props.availableAccounts"
                :available-categories="availableCategories"
                :available-merchants="availableMerchants"
                :show-account-filter="props.showAccountFilter" />
        </div>

        <!-- Summary bar -->
        <div
            v-if="summary || isLoadingSummary || isRefreshPending"
            class="bg-muted/30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-6 py-2.5 text-xs md:text-sm">
            <div class="text-muted-foreground flex items-center gap-2">
                <Icon name="iconoir:list" class="size-4" />
                <span v-if="summary" class="tabular-nums">
                    {{ t("transactions.list.summary.count", {count: summary.count}) }}
                </span>
                <Skeleton v-else class="h-4 w-24" />
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span class="text-muted-foreground flex items-center gap-1">
                    <Icon name="iconoir:arrow-down-left" class="text-success size-3.5" />
                    <span v-if="summary" class="tabular-nums">{{ formatCurrency(summary.income) }}</span>
                    <Skeleton v-else class="h-4 w-16" />
                </span>
                <span class="text-muted-foreground flex items-center gap-1">
                    <Icon name="iconoir:arrow-up-right" class="text-destructive size-3.5" />
                    <span v-if="summary" class="tabular-nums">{{ formatCurrency(summary.expense) }}</span>
                    <Skeleton v-else class="h-4 w-16" />
                </span>
                <span
                    class="flex items-center gap-1 font-medium"
                    :class="
                        summary ? (summary.net >= 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground'
                    ">
                    <span class="text-muted-foreground text-xs">{{ t("transactions.list.summary.net") }}</span>
                    <span v-if="summary" class="tabular-nums">{{ formatCurrency(summary.net) }}</span>
                    <Skeleton v-else class="h-4 w-20" />
                </span>
            </div>
        </div>

        <ScrollArea class="min-h-0 flex-1 overflow-hidden rounded-b-md border-t" scrollbar-class="pt-[41px]">
            <TransactionTable
                v-model:sorting="sorting"
                :account-name-by-id="accountNameById"
                :is-filtered="hasActiveFilters"
                :is-loading="isLoading"
                :show-account-column="props.showAccountColumn"
                :transactions="transactions"
                @row-click="handleTransactionClick" />
            <div v-if="hasMorePages" ref="loadMoreTrigger" aria-hidden="true" class="h-1 w-full" />
        </ScrollArea>

        <TransactionFormModal
            v-model:open="isTransactionModalOpen"
            :account-id="accountId"
            :transaction="selectedTransaction"
            @saved="onTransactionSaved"
            @view-linked="handleViewLinked" />
    </div>
</template>
