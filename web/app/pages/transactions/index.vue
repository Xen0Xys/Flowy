<script setup lang="ts">
import {ref, computed, onMounted} from "vue";
import {useTransactionStore} from "~/stores/transaction.store";
import TransactionListWidget from "~/components/transactions/TransactionListWidget.vue";
import {Skeleton} from "~/components/ui/skeleton";

const transactionStore = useTransactionStore();
const isLoading = ref(true);

const allTransactions = computed(() => transactionStore.transactions);

const loadData = async () => {
    isLoading.value = true;
    try {
        await transactionStore.fetchTransactions();
    } catch (err) {
        console.error(err);
    } finally {
        isLoading.value = false;
    }
};

onMounted(loadData);

const onTransactionSaved = () => {
    loadData();
};
</script>

<template>
    <div class="flex flex-col gap-6 md:h-[calc(100dvh-4rem-1.5rem)]">
        <!-- Header -->
        <div class="flex shrink-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div class="flex items-start gap-4 md:items-center">
                <div class="flex-1">
                    <h1 class="text-2xl font-bold tracking-tight md:text-3xl">All Transactions</h1>
                    <div class="mt-1 flex flex-wrap items-center gap-2">
                        <span class="text-muted-foreground text-sm"> View and manage all your transactions. </span>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="isLoading" class="flex flex-col gap-6 md:min-h-0 md:flex-1">
            <div class="space-y-4 md:flex-1 md:overflow-hidden">
                <Skeleton class="h-20 w-full" />
                <Skeleton class="h-20 w-full" />
                <Skeleton class="h-20 w-full" />
            </div>
        </div>

        <template v-else>
            <TransactionListWidget :transactions="allTransactions" @saved="onTransactionSaved" />
        </template>
    </div>
</template>
