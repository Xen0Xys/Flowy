<script setup lang="ts">
import {ref} from "vue";
import {useMediaQuery} from "@vueuse/core";
import type {Transaction} from "~/stores/transaction.store";
import TransactionTable from "~/components/transactions/TransactionTable.vue";
import TransactionFormModal from "~/components/transactions/TransactionFormModal.vue";
import {Button} from "~/components/ui/button";
import {ScrollArea} from "~/components/ui/scroll-area";
import {NuxtLink} from "#components";

const props = defineProps<{
    transactions: Transaction[];
    accountId?: string;
    showViewAll?: boolean;
    viewAllLink?: string;
}>();

const emit = defineEmits<{
    (e: "saved"): void;
}>();

const isMobile = useMediaQuery("(max-width: 768px)");

const isTransactionModalOpen = ref(false);
const selectedTransaction = ref<Transaction | null>(null);

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
    <div class="bg-card text-card-foreground flex flex-col rounded-xl border p-6 shadow-sm md:mb-6 md:min-h-0 md:flex-1">
        <div class="mb-4 flex shrink-0 items-center justify-between">
            <div class="flex items-center gap-4">
                <h3 class="text-lg leading-none font-semibold tracking-tight">Transactions</h3>
                <NuxtLink
                    v-if="showViewAll && viewAllLink"
                    :to="viewAllLink"
                    class="text-muted-foreground hover:text-foreground text-sm hover:underline">
                    View All
                </NuxtLink>
            </div>
            <Button v-if="accountId" @click="handleNewTransactionClick" size="sm">
                <Icon name="iconoir:plus" class="h-4 w-4" />
                New Transaction
            </Button>
        </div>
        <component
            :is="!isMobile ? ScrollArea : 'div'"
            :scrollbar-class="!isMobile ? 'pt-[41px]' : ''"
            :class="
                !isMobile
                    ? 'overflow-hidden rounded-md border md:min-h-0 md:flex-1'
                    : 'overflow-hidden rounded-md border'
            ">
            <TransactionTable :transactions="transactions" @row-click="handleTransactionClick" />
        </component>

        <TransactionFormModal
            v-model:open="isTransactionModalOpen"
            :transaction="selectedTransaction"
            :account-id="accountId"
            @saved="onTransactionSaved" />
    </div>
</template>
