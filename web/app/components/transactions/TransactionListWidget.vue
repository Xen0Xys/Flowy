<script setup lang="ts">
import {ref, computed, watch, onMounted} from "vue";
import {useMediaQuery} from "@vueuse/core";
import {watchDebounced} from "@vueuse/core";
import {useI18n} from "vue-i18n";
import {useTransactionStore, type Transaction, type TransactionSearchFilters} from "~/stores/transaction.store";
import TransactionTable from "~/components/transactions/TransactionTable.vue";
import TransactionFormModal from "~/components/transactions/TransactionFormModal.vue";
import TransactionFiltersBar, {type TransactionFilters} from "~/components/transactions/TransactionFiltersBar.vue";
import {Button} from "~/components/ui/button";
import {ScrollArea} from "~/components/ui/scroll-area";
import {NuxtLink} from "#components";

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

const isMobile = useMediaQuery("(max-width: 768px)");
const {t} = useI18n();
const transactionStore = useTransactionStore();

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

const availableCategories = computed(() => {
    const categoriesMap = new Map<string, {id: string; name: string}>();
    const items = transactionStore.searchResult?.items ?? [];
    for (const tx of items) {
        if (tx.category && !categoriesMap.has(tx.category.id)) {
            categoriesMap.set(tx.category.id, {id: tx.category.id, name: tx.category.name});
        }
    }
    return Array.from(categoriesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
});

const availableMerchants = computed(() => {
    const merchantsMap = new Map<string, {id: string; name: string}>();
    const items = transactionStore.searchResult?.items ?? [];
    for (const tx of items) {
        if (tx.merchant && !merchantsMap.has(tx.merchant.id)) {
            merchantsMap.set(tx.merchant.id, {id: tx.merchant.id, name: tx.merchant.name});
        }
    }
    return Array.from(merchantsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
});

const accountNameById = computed(() => {
    return Object.fromEntries((props.availableAccounts || []).map((account) => [account.id, account.name]));
});

const transactions = computed(() => transactionStore.searchResult?.items ?? []);
const isLoading = computed(() => transactionStore.isSearching);
const totalResults = computed(() => transactionStore.searchResult?.total ?? 0);

const buildSearchFilters = (): TransactionSearchFilters => {
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

    return searchFilters;
};

const fetchTransactions = async () => {
    try {
        const searchFilters = buildSearchFilters();
        await transactionStore.searchTransactions(searchFilters);
    } catch (err) {
        console.error(err);
    }
};

watchDebounced(
    filters,
    () => {
        fetchTransactions();
    },
    {debounce: 300, deep: true},
);

onMounted(() => {
    fetchTransactions();
});

const handleNewTransactionClick = () => {
    selectedTransaction.value = null;
    isTransactionModalOpen.value = true;
};

const handleTransactionClick = (transaction: Transaction) => {
    selectedTransaction.value = transaction;
    isTransactionModalOpen.value = true;
};

const onTransactionSaved = () => {
    fetchTransactions();
    emit("saved");
};
</script>

<template>
    <div class="bg-card text-card-foreground flex flex-col rounded-xl border shadow-sm md:mb-6 md:min-h-0 md:flex-1">
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
                <Button v-if="accountId" @click="handleNewTransactionClick" size="sm">
                    <Icon name="iconoir:plus" class="h-4 w-4" />
                    {{ t("transactions.list.newTransaction") }}
                </Button>
            </div>

            <TransactionFiltersBar
                v-model="filters"
                :available-categories="availableCategories"
                :available-merchants="availableMerchants"
                :available-accounts="props.availableAccounts"
                :show-account-filter="props.showAccountFilter" />
        </div>

        <component
            :is="!isMobile ? ScrollArea : 'div'"
            :scrollbar-class="!isMobile ? 'pt-[41px]' : ''"
            :class="
                !isMobile
                    ? 'overflow-hidden rounded-b-md border-t md:min-h-0 md:flex-1'
                    : 'overflow-hidden rounded-b-md border-t'
            ">
            <TransactionTable
                :transactions="transactions"
                :is-filtered="totalResults !== transactions.length || Object.keys(buildSearchFilters()).length > 0"
                :show-account-column="props.showAccountColumn"
                :account-name-by-id="accountNameById"
                @row-click="handleTransactionClick" />
        </component>

        <TransactionFormModal
            v-model:open="isTransactionModalOpen"
            :transaction="selectedTransaction"
            :account-id="accountId"
            @saved="onTransactionSaved" />
    </div>
</template>
