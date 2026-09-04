<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {ChevronsUpDown} from "lucide-vue-next";
import {Icon} from "#components";
import {
    type CreateRecurringTransactionPayload,
    type RecurrenceFrequency,
    type RecurringTransaction,
    type UpdateRecurringTransactionPayload,
    useRecurringTransactionStore,
} from "~/stores/recurring-transaction.store";
import {useAccountStore} from "~/stores/account.store";
import {useReferenceStore} from "~/stores/reference.store";
import {useFamilyStore} from "~/stores/family.store";
import {Button} from "~/components/ui/button";
import {Input} from "~/components/ui/input";
import {Label} from "~/components/ui/label";
import {Switch} from "~/components/ui/switch";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {
    Combobox,
    ComboboxAnchor,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxTrigger,
    ComboboxViewport,
} from "~/components/ui/combobox";
import MoneyInput from "~/components/common/MoneyInput.vue";
import TransactionReferenceCombobox from "~/components/transactions/TransactionReferenceCombobox.vue";
import CategoryDialog from "~/components/references/CategoryDialog.vue";
import MerchantDialog from "~/components/references/MerchantDialog.vue";

type TransactionType = "expense" | "income";

const props = defineProps<{
    open: boolean;
    recurringTransaction: RecurringTransaction | null;
}>();

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "saved"): void;
}>();

const {t} = useI18n();
const store = useRecurringTransactionStore();
const accountStore = useAccountStore();
const referenceStore = useReferenceStore();
const familyStore = useFamilyStore();

const isSubmitting = ref(false);
const transactionType = ref<TransactionType>("expense");
const isCreateCategoryDialogOpen = ref(false);
const isCreateMerchantDialogOpen = ref(false);

const handleCategoryCreated = (category: {id: string}) => {
    formData.value.categoryId = category.id;
};

const handleMerchantCreated = (merchant: {id: string}) => {
    formData.value.merchantId = merchant.id;
};

const currency = computed(() => familyStore.family?.currency ?? "USD");
const availableAccounts = computed(() => accountStore.accounts);
const availableCategories = computed(() => referenceStore.categories);
const availableMerchants = computed(() => referenceStore.merchants);

const categoryItems = computed(() =>
    availableCategories.value.map((c) => ({id: c.id, name: c.name, icon: c.icon, hexColor: c.hexColor})),
);
const merchantItems = computed(() => availableMerchants.value.map((m) => ({id: m.id, name: m.name})));

const supportedTimezones = computed<string[]>(() => {
    try {
        return (Intl as any).supportedValuesOf?.("timeZone") ?? [];
    } catch {
        return [];
    }
});

const browserTimezone = (): string => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
};

const formData = ref({
    name: "",
    amount: 0,
    accountId: "",
    categoryId: "none",
    merchantId: "none",
    frequency: "MONTHLY" as RecurrenceFrequency,
    dayOfMonth: new Date().getDate(),
    dayOfWeek: new Date().getDay(),
    timezone: browserTimezone(),
    inBudget: true,
    isEnabled: true,
});

const isEditing = computed(() => Boolean(props.recurringTransaction));

const initForm = () => {
    if (props.recurringTransaction) {
        const rt = props.recurringTransaction;
        transactionType.value = rt.amount < 0 ? "expense" : "income";
        formData.value = {
            name: rt.name,
            amount: Math.abs(rt.amount),
            accountId: rt.accountId,
            categoryId: rt.category?.id ?? "none",
            merchantId: rt.merchant?.id ?? "none",
            frequency: rt.frequency,
            dayOfMonth: rt.dayOfMonth ?? new Date().getDate(),
            dayOfWeek: rt.dayOfWeek ?? new Date().getDay(),
            timezone: rt.timezone,
            inBudget: rt.inBudget,
            isEnabled: rt.isEnabled,
        };
    } else {
        const now = new Date();
        transactionType.value = "expense";
        formData.value = {
            name: "",
            amount: 0,
            accountId: availableAccounts.value[0]?.id ?? "",
            categoryId: "none",
            merchantId: "none",
            frequency: "MONTHLY",
            dayOfMonth: now.getDate(),
            dayOfWeek: now.getDay(),
            timezone: browserTimezone(),
            inBudget: true,
            isEnabled: true,
        };
    }
};

watch(
    () => props.open,
    (open) => {
        if (open) initForm();
    },
    {immediate: true},
);

const isWeekly = computed(() => formData.value.frequency === "WEEKLY");

const frequencyOptions: {value: RecurrenceFrequency; labelKey: string}[] = [
    {value: "WEEKLY", labelKey: "recurring.frequency.weekly"},
    {value: "MONTHLY", labelKey: "recurring.frequency.monthly"},
    {value: "BIMONTHLY", labelKey: "recurring.frequency.bimonthly"},
    {value: "QUARTERLY", labelKey: "recurring.frequency.quarterly"},
    {value: "SEMIANNUAL", labelKey: "recurring.frequency.semiannual"},
    {value: "YEARLY", labelKey: "recurring.frequency.yearly"},
];

const dayOfWeekOptions = [
    {value: 0, labelKey: "recurring.dayOfWeek.sunday"},
    {value: 1, labelKey: "recurring.dayOfWeek.monday"},
    {value: 2, labelKey: "recurring.dayOfWeek.tuesday"},
    {value: 3, labelKey: "recurring.dayOfWeek.wednesday"},
    {value: 4, labelKey: "recurring.dayOfWeek.thursday"},
    {value: 5, labelKey: "recurring.dayOfWeek.friday"},
    {value: 6, labelKey: "recurring.dayOfWeek.saturday"},
];

const dayOfMonthOptions = Array.from({length: 31}, (_, i) => i + 1);

const isTypePositive = computed({
    get: () => transactionType.value === "income",
    set: (value) => (transactionType.value = value ? "income" : "expense"),
});

const isValid = computed(() => {
    if (!formData.value.name.trim()) return false;
    if (!formData.value.accountId) return false;
    if (formData.value.amount <= 0) return false;
    if (!formData.value.timezone) return false;
    return true;
});

const timezoneOpen = ref(false);

const handleTimezoneSelect = (value: string | number | boolean | Array<string | number | boolean>) => {
    formData.value.timezone = String(value);
    timezoneOpen.value = false;
};

const submit = async () => {
    if (!isValid.value) return;
    isSubmitting.value = true;
    try {
        const signedAmount =
            transactionType.value === "expense" ? -Math.abs(formData.value.amount) : Math.abs(formData.value.amount);
        const basePayload = {
            name: formData.value.name.trim(),
            amount: signedAmount,
            frequency: formData.value.frequency,
            timezone: formData.value.timezone,
            inBudget: formData.value.inBudget,
            isEnabled: formData.value.isEnabled,
            ...(isWeekly.value
                ? {dayOfWeek: formData.value.dayOfWeek, dayOfMonth: undefined}
                : {dayOfMonth: formData.value.dayOfMonth, dayOfWeek: undefined}),
        };

        if (isEditing.value && props.recurringTransaction) {
            const updatePayload: UpdateRecurringTransactionPayload = {
                ...basePayload,
                merchantId: formData.value.merchantId === "none" ? null : formData.value.merchantId,
                categoryId: formData.value.categoryId === "none" ? null : formData.value.categoryId,
            };
            await store.update(props.recurringTransaction.id, updatePayload);
        } else {
            const createPayload: CreateRecurringTransactionPayload = {
                ...basePayload,
                ...(formData.value.merchantId !== "none" ? {merchantId: formData.value.merchantId} : {}),
                ...(formData.value.categoryId !== "none" ? {categoryId: formData.value.categoryId} : {}),
            };
            await store.create(formData.value.accountId, createPayload);
        }
        emit("saved");
        emit("update:open", false);
    } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
    } finally {
        isSubmitting.value = false;
    }
};

const close = () => emit("update:open", false);
</script>

<template>
    <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
        <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>
                    {{ isEditing ? t("recurring.form.editTitle") : t("recurring.form.createTitle") }}
                </DialogTitle>
                <DialogDescription>{{ t("recurring.form.description") }}</DialogDescription>
            </DialogHeader>

            <div class="flex flex-col gap-4">
                <!-- Type toggle + amount -->
                <div class="flex items-center gap-2">
                    <button
                        :class="[
                            'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition',
                            !isTypePositive
                                ? 'bg-destructive/10 border-destructive text-destructive'
                                : 'border-border text-muted-foreground hover:bg-muted/50',
                        ]"
                        type="button"
                        @click="isTypePositive = false">
                        <Icon class="mr-1 inline h-4 w-4" name="iconoir:arrow-down-right" />
                        {{ t("recurring.form.expense") }}
                    </button>
                    <button
                        :class="[
                            'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition',
                            isTypePositive
                                ? 'bg-success/10 border-success text-success'
                                : 'border-border text-muted-foreground hover:bg-muted/50',
                        ]"
                        type="button"
                        @click="isTypePositive = true">
                        <Icon class="mr-1 inline h-4 w-4" name="iconoir:arrow-up-right" />
                        {{ t("recurring.form.income") }}
                    </button>
                </div>

                <div class="grid gap-2">
                    <Label for="recurring-amount">{{ t("recurring.form.amount") }}</Label>
                    <MoneyInput
                        id="recurring-amount"
                        v-model="formData.amount"
                        :currency="currency"
                        :variant="transactionType"
                        size="sm" />
                </div>

                <div class="grid gap-2">
                    <Label for="recurring-name">{{ t("recurring.form.name") }}</Label>
                    <Input
                        id="recurring-name"
                        v-model="formData.name"
                        :placeholder="t('recurring.form.namePlaceholder')" />
                </div>

                <div class="grid gap-2">
                    <Label for="recurring-account">{{ t("recurring.form.account") }}</Label>
                    <Select v-model="formData.accountId" :disabled="isEditing">
                        <SelectTrigger id="recurring-account">
                            <SelectValue :placeholder="t('recurring.form.accountPlaceholder')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="acc in availableAccounts" :key="acc.id" :value="acc.id">
                                {{ acc.name }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div class="grid gap-2">
                    <Label>{{ t("recurring.form.category") }}</Label>
                    <TransactionReferenceCombobox
                        v-model="formData.categoryId"
                        :items="categoryItems"
                        :placeholder="t('recurring.form.categoryPlaceholder')"
                        :empty-text="t('recurring.form.categoryEmpty')"
                        :none-label="t('common.none')"
                        :create-label="t('recurring.form.createCategory')"
                        @create="isCreateCategoryDialogOpen = true" />
                </div>

                <div class="grid gap-2">
                    <Label>{{ t("recurring.form.merchant") }}</Label>
                    <TransactionReferenceCombobox
                        v-model="formData.merchantId"
                        :items="merchantItems"
                        :placeholder="t('recurring.form.merchantPlaceholder')"
                        :empty-text="t('recurring.form.merchantEmpty')"
                        :none-label="t('common.none')"
                        :create-label="t('recurring.form.createMerchant')"
                        @create="isCreateMerchantDialogOpen = true" />
                </div>

                <div class="grid gap-2">
                    <Label for="recurring-frequency">{{ t("recurring.form.frequency") }}</Label>
                    <Select v-model="formData.frequency">
                        <SelectTrigger id="recurring-frequency">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="opt in frequencyOptions" :key="opt.value" :value="opt.value">
                                {{ t(opt.labelKey) }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div v-if="isWeekly" class="grid gap-2">
                    <Label for="recurring-day-of-week">{{ t("recurring.form.dayOfWeek") }}</Label>
                    <Select
                        :model-value="String(formData.dayOfWeek)"
                        @update:model-value="(v) => (formData.dayOfWeek = Number(v))">
                        <SelectTrigger id="recurring-day-of-week">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="opt in dayOfWeekOptions" :key="opt.value" :value="String(opt.value)">
                                {{ t(opt.labelKey) }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div v-else class="grid gap-2">
                    <Label for="recurring-day-of-month">{{ t("recurring.form.dayOfMonth") }}</Label>
                    <Select
                        :model-value="String(formData.dayOfMonth)"
                        @update:model-value="(v) => (formData.dayOfMonth = Number(v))">
                        <SelectTrigger id="recurring-day-of-month">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent class="max-h-64">
                            <SelectItem v-for="d in dayOfMonthOptions" :key="d" :value="String(d)">
                                {{ d }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <p class="text-muted-foreground text-xs">{{ t("recurring.form.dayOfMonthHint") }}</p>
                </div>

                <div class="grid gap-2">
                    <Label>{{ t("recurring.form.timezone") }}</Label>
                    <Combobox
                        v-model="formData.timezone"
                        :open="timezoneOpen"
                        @update:open="(v) => (timezoneOpen = v)"
                        @update:model-value="handleTimezoneSelect">
                        <ComboboxAnchor as-child>
                            <ComboboxTrigger as-child>
                                <Button type="button" variant="outline" class="w-full justify-between font-normal">
                                    <span class="truncate">{{ formData.timezone }}</span>
                                    <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </ComboboxTrigger>
                        </ComboboxAnchor>
                        <ComboboxList
                            class="*:data-[slot=input-group]:!m-0 *:data-[slot=input-group]:!rounded-none *:data-[slot=input-group]:!border-x-0 *:data-[slot=input-group]:!border-t-0">
                            <ComboboxInput
                                :placeholder="t('recurring.form.timezonePlaceholder')"
                                class="text-base !outline-none focus:!ring-0 focus:!outline-none focus-visible:!ring-0 focus-visible:!outline-none md:text-sm" />
                            <ComboboxEmpty>{{ t("recurring.form.timezoneEmpty") }}</ComboboxEmpty>
                            <ComboboxViewport>
                                <ComboboxGroup>
                                    <ComboboxItem v-for="tz in supportedTimezones" :key="tz" :value="tz">
                                        {{ tz }}
                                    </ComboboxItem>
                                </ComboboxGroup>
                            </ComboboxViewport>
                        </ComboboxList>
                    </Combobox>
                </div>

                <div class="flex items-center justify-between rounded-lg border p-3">
                    <div>
                        <p class="text-sm font-medium">{{ t("recurring.form.inBudget") }}</p>
                        <p class="text-muted-foreground text-xs">{{ t("recurring.form.inBudgetHint") }}</p>
                    </div>
                    <Switch v-model="formData.inBudget" />
                </div>

                <div class="flex items-center justify-between rounded-lg border p-3">
                    <div>
                        <p class="text-sm font-medium">{{ t("recurring.form.enabled") }}</p>
                        <p class="text-muted-foreground text-xs">{{ t("recurring.form.enabledHint") }}</p>
                    </div>
                    <Switch v-model="formData.isEnabled" />
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" type="button" @click="close">{{ t("common.cancel") }}</Button>
                <Button :disabled="!isValid || isSubmitting" type="button" @click="submit">
                    {{ isSubmitting ? t("common.saving") : t("common.save") }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <CategoryDialog
        :open="isCreateCategoryDialogOpen"
        @saved="handleCategoryCreated"
        @update:open="isCreateCategoryDialogOpen = $event" />

    <MerchantDialog
        :open="isCreateMerchantDialogOpen"
        @saved="handleMerchantCreated"
        @update:open="isCreateMerchantDialogOpen = $event" />
</template>
