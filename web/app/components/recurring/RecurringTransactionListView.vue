<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {Icon} from "#components";
import type {RecurringTransaction} from "~/stores/recurring-transaction.store";
import {useAccountStore} from "~/stores/account.store";
import RecurringTransactionRow from "./RecurringTransactionRow.vue";

const props = defineProps<{
    items: RecurringTransaction[];
    currency: string;
}>();

const emit = defineEmits<{
    (e: "select", rt: RecurringTransaction): void;
    (e: "toggle", rt: RecurringTransaction, value: boolean): void;
}>();

const {t} = useI18n();
const accountStore = useAccountStore();

const accountsById = computed(() => new Map(accountStore.accounts.map((a) => [a.id, a])));
</script>

<template>
    <div v-if="items.length > 0" class="flex flex-col gap-2">
        <RecurringTransactionRow
            v-for="rt in items"
            :key="rt.id"
            :recurring-transaction="rt"
            :currency="currency"
            :account-name="accountsById.get(rt.accountId)?.name"
            @click="emit('select', rt)"
            @toggle="(v) => emit('toggle', rt, v)" />
    </div>
    <div v-else class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <Icon class="text-muted-foreground size-8" name="iconoir:refresh-double" />
        <div>
            <p class="text-sm font-medium">{{ t("recurring.list.empty") }}</p>
            <p class="text-muted-foreground text-xs">{{ t("recurring.list.emptyHint") }}</p>
        </div>
    </div>
</template>
