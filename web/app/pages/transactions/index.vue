<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {useAccountStore} from "~/stores/account.store";
import {type Transaction, useTransactionStore} from "~/stores/transaction.store";
import TransactionListWidget from "~/components/transactions/TransactionListWidget.vue";
import TransactionFormModal from "~/components/transactions/TransactionFormModal.vue";
import {Skeleton} from "~/components/ui/skeleton";
import {Button} from "~/components/ui/button";

const accountStore = useAccountStore();
const transactionStore = useTransactionStore();
const {t} = useI18n();
const isLoading = ref(true);

const isTransactionModalOpen = ref(false);
const selectedTransaction = ref<Transaction | null>(null);

const availableAccounts = computed(() =>
    accountStore.accounts.map((account) => ({
        id: account.id,
        name: account.name,
    })),
);

const loadData = async () => {
    isLoading.value = true;
    try {
        await accountStore.fetchAccounts();
    } catch (err) {
        console.error(err);
    } finally {
        isLoading.value = false;
    }
};

onMounted(loadData);

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

const handleNewTransaction = () => {
    selectedTransaction.value = null;
    isTransactionModalOpen.value = true;
};

const onTransactionSaved = () => {
    loadData();
};
</script>

<template>
    <div class="w-full">
        <div class="mx-auto max-w-7xl">
            <div class="flex flex-col gap-6 md:h-[calc(100dvh-4rem-1.5rem)]">
                <!-- Header -->
                <div class="flex shrink-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div class="flex items-center gap-3">
                        <Icon class="icon-lg text-primary shrink-0" name="iconoir:credit-card" />
                        <div class="min-w-0">
                            <h1 class="text-2xl font-bold tracking-tight">
                                {{ t("transactions.page.title") }}
                            </h1>
                            <p class="text-muted-foreground text-sm">
                                {{ t("transactions.page.subtitle") }}
                            </p>
                        </div>
                    </div>
                    <Button class="w-full md:w-auto" @click="handleNewTransaction">
                        <Icon class="mr-2 h-4 w-4" name="iconoir:plus" />
                        {{ t("transactions.list.newTransaction") }}
                    </Button>
                </div>

                <div v-if="isLoading" class="flex flex-col gap-6 md:min-h-0 md:flex-1">
                    <div class="space-y-4 md:flex-1 md:overflow-hidden">
                        <Skeleton class="h-20 w-full" />
                        <Skeleton class="h-20 w-full" />
                        <Skeleton class="h-20 w-full" />
                    </div>
                </div>

                <template v-else>
                    <TransactionListWidget
                        :available-accounts="availableAccounts"
                        :show-account-column="true"
                        :show-account-filter="true"
                        @saved="onTransactionSaved" />
                </template>

                <TransactionFormModal
                    v-model:open="isTransactionModalOpen"
                    :transaction="selectedTransaction"
                    @saved="onTransactionSaved"
                    @view-linked="handleViewLinked" />
            </div>
        </div>
    </div>
</template>
