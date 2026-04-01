<script setup lang="ts">
import {ref, computed} from "vue";
import {useMediaQuery} from "@vueuse/core";
import {useI18n} from "vue-i18n";
import type {Transaction} from "~/stores/transaction.store";
import TransactionTable from "~/components/transactions/TransactionTable.vue";
import TransactionFormModal from "~/components/transactions/TransactionFormModal.vue";
import TransactionFiltersBar, {type TransactionFilters} from "~/components/transactions/TransactionFiltersBar.vue";
import {Button} from "~/components/ui/button";
import {ScrollArea} from "~/components/ui/scroll-area";
import {NuxtLink} from "#components";
import {CalendarDate, DateFormatter, getLocalTimeZone} from "@internationalized/date";

const props = defineProps<{
    transactions: Transaction[];
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
    for (const tx of props.transactions) {
        if (tx.category && !categoriesMap.has(tx.category.id)) {
            categoriesMap.set(tx.category.id, {id: tx.category.id, name: tx.category.name});
        }
    }
    return Array.from(categoriesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
});

const availableMerchants = computed(() => {
    const merchantsMap = new Map<string, {id: string; name: string}>();
    for (const tx of props.transactions) {
        if (tx.merchant && !merchantsMap.has(tx.merchant.id)) {
            merchantsMap.set(tx.merchant.id, {id: tx.merchant.id, name: tx.merchant.name});
        }
    }
    return Array.from(merchantsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
});

const accountNameById = computed(() => {
    return Object.fromEntries((props.availableAccounts || []).map((account) => [account.id, account.name]));
});

const filteredTransactions = computed(() => {
    return props.transactions.filter((t) => {
        // 1. Search (description, category, merchant)
        if (filters.value.search) {
            const query = filters.value.search.toLowerCase();
            const matchDesc = t.description.toLowerCase().includes(query);
            const matchCat = t.category?.name.toLowerCase().includes(query);
            const matchMerchant = t.merchant?.name.toLowerCase().includes(query);
            if (!matchDesc && !matchCat && !matchMerchant) return false;
        }

        // 2. Type
        if (filters.value.type === "income" && t.amount <= 0) return false;
        if (filters.value.type === "expense" && t.amount >= 0) return false;

        // 3. Category
        if (filters.value.categoryId !== "all" && t.category?.id !== filters.value.categoryId) return false;

        // 4. Account
        if (filters.value.accountId !== "all" && t.accountId !== filters.value.accountId) return false;

        // 5. Merchant
        if (filters.value.merchantId !== "all" && t.merchant?.id !== filters.value.merchantId) return false;

        // 6. Rebalance
        if (filters.value.rebalance === "only" && !t.isRebalance) return false;
        if (filters.value.rebalance === "exclude" && t.isRebalance) return false;

        // 7. Date Range
        if (filters.value.dateRange.start || filters.value.dateRange.end) {
            const tDate = new Date(t.date);
            tDate.setHours(0, 0, 0, 0);

            if (filters.value.dateRange.start) {
                const calStart = filters.value.dateRange.start as any;
                const start = new Date(calStart.year, calStart.month - 1, calStart.day);
                start.setHours(0, 0, 0, 0);
                if (tDate < start) return false;
            }
            if (filters.value.dateRange.end) {
                const calEnd = filters.value.dateRange.end as any;
                const end = new Date(calEnd.year, calEnd.month - 1, calEnd.day);
                end.setHours(23, 59, 59, 999);
                if (tDate > end) return false;
            }
        }

        return true;
    });
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
                :transactions="filteredTransactions"
                :is-filtered="filteredTransactions.length !== transactions.length"
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
