<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {type Transaction, useTransactionStore} from "~/stores/transaction.store";
import {useAccountStore} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import {toCurrency} from "~/lib/currency";
import {cn} from "~/lib/utils";
import {Button} from "~/components/ui/button";
import {Label} from "~/components/ui/label";
import {Alert, AlertDescription, AlertTitle} from "~/components/ui/alert";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle} from "~/components/ui/sheet";
import {Icon} from "#components";

const props = defineProps<{
    open: boolean;
    transaction: Transaction | null;
}>();

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "linked"): void;
}>();

const transactionStore = useTransactionStore();
const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const {t, locale} = useI18n();

const selectedAccountId = ref<string>("");
const eligibleTransactions = ref<Transaction[]>([]);
const selectedTransactionId = ref<string>("");
const isLoading = ref(false);
const isLinking = ref(false);

const linkableAccounts = computed(() => {
    if (!props.transaction) return [];
    return accountStore.accounts.filter((acc) => acc.id !== props.transaction?.accountId);
});

const formatCurrency = (value: number) => toCurrency(value, familyStore.family?.currency || "USD");

const formattedTransactionAmount = computed(() => {
    if (!props.transaction) return "";
    return formatCurrency(Math.abs(props.transaction.amount));
});

const formattedTransactionDate = computed(() => {
    if (!props.transaction?.date) return "";
    return new Date(props.transaction.date).toLocaleDateString(locale.value || "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
});

const isExpense = computed(() => (props.transaction?.amount ?? 0) < 0);

const resetState = () => {
    selectedAccountId.value = "";
    eligibleTransactions.value = [];
    selectedTransactionId.value = "";
};

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) resetState();
    },
);

const fetchEligibleTransactions = async (accountId: string) => {
    if (!props.transaction || !accountId) return;

    isLoading.value = true;
    eligibleTransactions.value = [];
    selectedTransactionId.value = "";

    try {
        const transactionDate = new Date(props.transaction.date);
        const startDate = new Date(transactionDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(transactionDate);
        endDate.setHours(23, 59, 59, 999);

        const result = await transactionStore.searchTransactions({
            accountId,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
        });

        const targetAmount = Math.abs(props.transaction.amount);
        const oppositeSign = isExpense.value ? "income" : "expense";

        eligibleTransactions.value = result.items.filter((tx) => {
            const hasOppositeSign = oppositeSign === "income" ? tx.amount > 0 : tx.amount < 0;
            const hasSameAmount = Math.abs(tx.amount) === targetAmount;
            const isNotLinked = !tx.linkedTransactionId;
            return hasOppositeSign && hasSameAmount && isNotLinked;
        });
    } catch (err) {
        console.error(err);
        toast.error(t("transactions.form.errors.loadData"));
    } finally {
        isLoading.value = false;
    }
};

const handleAccountChange = (accountId: string) => {
    selectedAccountId.value = accountId;
    fetchEligibleTransactions(accountId);
};

const executeLink = async () => {
    if (!props.transaction || !selectedTransactionId.value) return;

    isLinking.value = true;
    try {
        await transactionStore.linkTransactions(props.transaction.id, selectedTransactionId.value);
        emit("linked");
        emit("update:open", false);
    } catch (err) {
        console.error(err);
    } finally {
        isLinking.value = false;
    }
};
</script>

<template>
    <Sheet :open="open" @update:open="emit('update:open', $event)">
        <SheetContent side="right" class="flex w-full flex-col gap-0 sm:max-w-md">
            <SheetHeader class="border-b">
                <SheetTitle>{{ t("transactions.transfer.linkTitle") }}</SheetTitle>
                <SheetDescription>
                    {{ t("transactions.transfer.linkDescription") }}
                </SheetDescription>
            </SheetHeader>

            <div class="flex-1 overflow-y-auto p-4">
                <div class="flex flex-col gap-4">
                    <Alert class="bg-muted/50">
                        <AlertTitle class="flex items-center gap-2">
                            <Icon :name="isExpense ? 'iconoir:folder-minus' : 'iconoir:folder-plus'" class="h-4 w-4" />
                            {{ isExpense ? t("transactions.filters.expense") : t("transactions.filters.income") }}
                        </AlertTitle>
                        <AlertDescription>
                            <div class="mt-1 flex flex-col gap-1">
                                <span>
                                    <strong>{{ t("transactions.table.amount") }}:</strong>
                                    {{ formattedTransactionAmount }}
                                </span>
                                <span>
                                    <strong>{{ t("transactions.table.date") }}:</strong>
                                    {{ formattedTransactionDate }}
                                </span>
                                <span>
                                    <strong>{{ t("transactions.table.description") }}:</strong>
                                    {{ props.transaction?.description }}
                                </span>
                            </div>
                        </AlertDescription>
                    </Alert>

                    <div class="flex flex-col gap-2">
                        <Label for="linkAccount">{{ t("transactions.transfer.selectAccount") }}</Label>
                        <Select :model-value="selectedAccountId" @update:model-value="handleAccountChange">
                            <SelectTrigger id="linkAccount">
                                <SelectValue :placeholder="t('transactions.form.selectAccount')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="account in linkableAccounts"
                                        :key="account.id"
                                        :value="account.id">
                                        {{ account.name }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>

                    <div v-if="selectedAccountId" class="flex flex-col gap-2">
                        <Label>{{ t("transactions.transfer.selectTransaction") }}</Label>

                        <div v-if="isLoading" class="flex items-center justify-center py-8">
                            <Icon class="h-6 w-6 animate-spin" name="iconoir:loading" />
                            <span class="ml-2">{{ t("transactions.transfer.loadingTransactions") }}</span>
                        </div>

                        <div
                            v-else-if="eligibleTransactions.length === 0"
                            class="text-muted-foreground rounded-md border border-dashed p-6 text-center">
                            {{ t("transactions.transfer.noEligibleTransactions") }}
                        </div>

                        <div v-else class="overflow-hidden rounded-md border">
                            <p class="text-muted-foreground border-b px-3 py-2 text-xs">
                                {{
                                    t("transactions.transfer.eligibilityHint", {
                                        amount: formattedTransactionAmount,
                                        date: formattedTransactionDate,
                                    })
                                }}
                            </p>
                            <div class="divide-y">
                                <button
                                    v-for="tx in eligibleTransactions"
                                    :key="tx.id"
                                    :class="
                                        cn(
                                            'hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                                            selectedTransactionId === tx.id && 'bg-muted',
                                        )
                                    "
                                    type="button"
                                    @click="selectedTransactionId = tx.id">
                                    <div
                                        :class="
                                            cn(
                                                'flex h-4 w-4 items-center justify-center rounded-full border',
                                                selectedTransactionId === tx.id
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-muted-foreground',
                                            )
                                        ">
                                        <Icon
                                            v-if="selectedTransactionId === tx.id"
                                            class="h-3 w-3"
                                            name="iconoir:check" />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <div class="truncate font-medium">{{ tx.description }}</div>
                                        <div class="text-muted-foreground text-sm">
                                            <span :class="tx.amount > 0 ? 'text-success' : 'text-destructive'">
                                                {{ tx.amount > 0 ? "+" : "" }}{{ formatCurrency(tx.amount) }}
                                            </span>
                                            <span> - {{ new Date(tx.date).toLocaleDateString() }}</span>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <SheetFooter class="border-t">
                <Button type="button" variant="outline" @click="emit('update:open', false)">
                    {{ t("common.cancel") }}
                </Button>
                <Button :disabled="!selectedTransactionId || isLinking" type="button" @click="executeLink">
                    {{ isLinking ? t("transactions.transfer.linkingButton") : t("transactions.transfer.linkButton") }}
                </Button>
            </SheetFooter>
        </SheetContent>
    </Sheet>
</template>
