<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useEventListener} from "@vueuse/core";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {
    type CreateTransactionPayload,
    type CreateTransferPayload,
    type Transaction,
    type UpdateTransactionPayload,
    useTransactionStore,
} from "~/stores/transaction.store";
import {useReferenceStore} from "~/stores/reference.store";
import {useAccountStore} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import {useDescriptionReferenceAutoFill} from "~/composables/useDescriptionReferenceAutoFill";
import {toCurrency} from "~/lib/currency";
import {cn} from "~/lib/utils";
import {Button} from "~/components/ui/button";
import {Input} from "~/components/ui/input";
import {Label} from "~/components/ui/label";
import {Switch} from "~/components/ui/switch";
import {Badge} from "~/components/ui/badge";
import {Separator} from "~/components/ui/separator";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Alert, AlertDescription, AlertTitle} from "~/components/ui/alert";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import MoneyInput from "~/components/common/MoneyInput.vue";
import DatePicker from "~/components/common/DatePicker.vue";
import CategoryDialog from "~/components/references/CategoryDialog.vue";
import MerchantDialog from "~/components/references/MerchantDialog.vue";
import TransactionLinkTransferSheet from "~/components/transactions/TransactionLinkTransferSheet.vue";
import TransactionReferenceCombobox from "~/components/transactions/TransactionReferenceCombobox.vue";
import {Icon} from "#components";

type TransactionType = "expense" | "income" | "transfer";

const props = defineProps<{
    open: boolean;
    transaction: Transaction | null;
    accountId?: string;
}>();

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "saved"): void;
    (e: "view-linked", transactionId: string): void;
}>();

const transactionStore = useTransactionStore();
const referenceStore = useReferenceStore();
const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const {t, locale} = useI18n();

const isSubmitting = ref(false);
const isDeleteDialogOpen = ref(false);
const isDeleting = ref(false);
const isCreateCategoryDialogOpen = ref(false);
const isCreateMerchantDialogOpen = ref(false);
const isLinkTransferSheetOpen = ref(false);
const keepLinkedTransaction = ref(false);
const isUnlinking = ref(false);

const currency = computed(() => familyStore.family?.currency || "USD");
const formatCurrency = (value: number) => toCurrency(value, currency.value);

const availableCategories = computed(() => referenceStore.categories);
const availableMerchants = computed(() => referenceStore.merchants);
const availableAccounts = computed(() => accountStore.accounts);

const categoryItems = computed(() =>
    availableCategories.value.map((c) => ({id: c.id, name: c.name, icon: c.icon, hexColor: c.hexColor})),
);
const merchantItems = computed(() => availableMerchants.value.map((m) => ({id: m.id, name: m.name})));

const formData = ref({
    amount: 0,
    description: "",
    date: "",
    categoryId: "none",
    merchantId: "none",
    selectedAccountId: "",
    inBudget: true,
});

const transferFormData = ref({
    sourceAccountId: "",
    destinationAccountId: "",
    amount: 0,
    description: "",
    date: "",
    inBudget: false,
});

const transactionType = ref<TransactionType>("expense");

const destinationAccounts = computed(() =>
    availableAccounts.value.filter((acc) => acc.id !== transferFormData.value.sourceAccountId),
);

const sourceAccount = computed(
    () => availableAccounts.value.find((acc) => acc.id === transferFormData.value.sourceAccountId) ?? null,
);
const destinationAccount = computed(
    () => availableAccounts.value.find((acc) => acc.id === transferFormData.value.destinationAccountId) ?? null,
);

const isRebalance = computed(() => props.transaction?.isRebalance ?? false);
const isLinkedTransfer = computed(() => Boolean(props.transaction?.linkedTransactionId));
const isEditing = computed(() => Boolean(props.transaction));

const today = () => new Date().toISOString().split("T")[0] || "";

const {reset: resetAutoFill} = useDescriptionReferenceAutoFill({
    description: computed({
        get: () => formData.value.description,
        set: (value) => (formData.value.description = value),
    }),
    categoryId: computed({
        get: () => formData.value.categoryId,
        set: (value) => (formData.value.categoryId = value),
    }),
    merchantId: computed({
        get: () => formData.value.merchantId,
        set: (value) => (formData.value.merchantId = value),
    }),
    categories: availableCategories,
    merchants: availableMerchants,
    enabled: computed(() => transactionType.value !== "transfer"),
});

const initFormFromProps = () => {
    keepLinkedTransaction.value = false;
    resetAutoFill();

    if (props.transaction) {
        transactionType.value = props.transaction.amount < 0 ? "expense" : "income";
        formData.value = {
            amount: Math.abs(props.transaction.amount),
            description: props.transaction.description,
            date: props.transaction.date ? new Date(props.transaction.date).toISOString().split("T")[0] || "" : "",
            categoryId: props.transaction.category?.id || "none",
            merchantId: props.transaction.merchant?.id || "none",
            selectedAccountId: props.transaction.accountId || props.accountId || "",
            inBudget: props.transaction.inBudget ?? true,
        };
    } else {
        transactionType.value = "expense";
        formData.value = {
            amount: 0,
            description: "",
            date: today(),
            categoryId: "none",
            merchantId: "none",
            selectedAccountId: props.accountId || "",
            inBudget: true,
        };
        transferFormData.value = {
            sourceAccountId: props.accountId || "",
            destinationAccountId: "",
            amount: 0,
            description: "",
            date: today(),
            inBudget: false,
        };
    }
};

const loadData = async () => {
    try {
        await Promise.all([
            referenceStore.fetchReferences(),
            !props.accountId ? accountStore.fetchAccounts() : Promise.resolve(),
        ]);
    } catch {
        toast.error(t("transactions.form.errors.loadData"));
    }
};

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            loadData();
            initFormFromProps();
        }
    },
    {immediate: true},
);

watch(() => props.transaction, initFormFromProps, {immediate: true});

const onOpenChange = (open: boolean) => emit("update:open", open);

const canSubmitStandard = computed(() => {
    if (transactionType.value === "transfer") return false;
    if (!formData.value.description.trim()) return false;
    if (!Number.isFinite(formData.value.amount) || formData.value.amount <= 0) return false;
    if (!formData.value.date) return false;
    const targetAccountId = props.accountId || formData.value.selectedAccountId;
    if (!targetAccountId) return false;
    return true;
});

const canSubmitTransfer = computed(() => {
    if (transactionType.value !== "transfer") return false;
    if (!transferFormData.value.sourceAccountId) return false;
    if (!transferFormData.value.destinationAccountId) return false;
    if (transferFormData.value.sourceAccountId === transferFormData.value.destinationAccountId) return false;
    if (!Number.isFinite(transferFormData.value.amount) || transferFormData.value.amount <= 0) return false;
    if (!transferFormData.value.date) return false;
    return true;
});

const canSubmitRebalance = computed(() => {
    if (!isRebalance.value) return false;
    if (!formData.value.date) return false;
    return true;
});

const canSubmit = computed(() => {
    if (isRebalance.value) return canSubmitRebalance.value;
    return transactionType.value === "transfer" ? canSubmitTransfer.value : canSubmitStandard.value;
});

const save = async () => {
    if (!canSubmit.value) return;

    isSubmitting.value = true;
    try {
        if (isRebalance.value && props.transaction) {
            const payload: UpdateTransactionPayload = {
                date: new Date(formData.value.date).toISOString(),
            };
            await transactionStore.updateTransaction(props.transaction.id, payload);
        } else if (transactionType.value === "transfer") {
            const payload: CreateTransferPayload = {
                debitAccountId: transferFormData.value.sourceAccountId,
                creditAccountId: transferFormData.value.destinationAccountId,
                amount: Math.abs(Number(transferFormData.value.amount)),
                description: transferFormData.value.description || t("transactions.transfer.badge"),
                date: new Date(transferFormData.value.date).toISOString(),
                inBudget: transferFormData.value.inBudget,
            };
            await transactionStore.createTransfer(payload);
        } else {
            const finalAmount =
                transactionType.value === "expense"
                    ? -Math.abs(Number(formData.value.amount))
                    : Math.abs(Number(formData.value.amount));

            if (props.transaction) {
                const payload: UpdateTransactionPayload = {
                    amount: finalAmount,
                    description: formData.value.description,
                    date: new Date(formData.value.date).toISOString(),
                    categoryId: formData.value.categoryId === "none" ? null : formData.value.categoryId,
                    merchantId: formData.value.merchantId === "none" ? null : formData.value.merchantId,
                    inBudget: formData.value.inBudget,
                };
                await transactionStore.updateTransaction(props.transaction.id, payload);
            } else {
                const payload: CreateTransactionPayload = {
                    amount: finalAmount,
                    description: formData.value.description,
                    date: new Date(formData.value.date).toISOString(),
                    categoryId: formData.value.categoryId === "none" ? undefined : formData.value.categoryId,
                    merchantId: formData.value.merchantId === "none" ? undefined : formData.value.merchantId,
                    inBudget: formData.value.inBudget,
                };
                const targetAccountId = props.accountId || formData.value.selectedAccountId;
                await transactionStore.createTransaction(targetAccountId, payload);
            }
        }

        emit("saved");
        emit("update:open", false);
    } catch (err) {
        console.error(err);
    } finally {
        isSubmitting.value = false;
    }
};

const confirmDelete = () => {
    isDeleteDialogOpen.value = true;
};

const executeDelete = async () => {
    if (!props.transaction) return;
    isDeleting.value = true;
    try {
        await transactionStore.deleteTransaction(props.transaction.id, {
            keepLinkedTransaction: keepLinkedTransaction.value,
        });
        isDeleteDialogOpen.value = false;
        emit("saved");
        emit("update:open", false);
    } catch (err) {
        console.error(err);
    } finally {
        isDeleting.value = false;
    }
};

const unlinkTransfer = async () => {
    if (!props.transaction?.linkedTransactionId) return;
    isUnlinking.value = true;
    try {
        await transactionStore.unlinkTransfer(props.transaction.id);
        emit("saved");
        emit("update:open", false);
    } catch (err) {
        console.error(err);
    } finally {
        isUnlinking.value = false;
    }
};

const viewLinkedTransaction = () => {
    if (!props.transaction?.linkedTransactionId) return;
    emit("view-linked", props.transaction.linkedTransactionId);
};

const handleCategoryCreated = (category: {id: string}) => {
    formData.value.categoryId = category.id;
};

const handleMerchantCreated = (merchant: {id: string}) => {
    formData.value.merchantId = merchant.id;
};

const onLinkTransferDone = () => {
    emit("saved");
    emit("update:open", false);
};

useEventListener("keydown", (event: KeyboardEvent) => {
    if (!props.open) return;
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        save();
    }
});

const typeOptions = computed(() => {
    const opts: {value: TransactionType; label: string; icon: string; activeClass: string; hidden?: boolean}[] = [
        {
            value: "expense",
            label: t("transactions.filters.expense"),
            icon: "iconoir:minus-circle",
            activeClass: "bg-destructive/10 text-destructive border-destructive/30",
        },
        {
            value: "income",
            label: t("transactions.filters.income"),
            icon: "iconoir:plus-circle",
            activeClass: "bg-success/10 text-success border-success/30",
        },
        {
            value: "transfer",
            label: t("transactions.transfer.tab"),
            icon: "iconoir:refresh-double",
            activeClass: "bg-primary/10 text-primary border-primary/30",
            hidden: isEditing.value,
        },
    ];
    return opts.filter((o) => !o.hidden);
});

const amountVariant = computed<"expense" | "income" | "neutral">(() => {
    if (transactionType.value === "expense") return "expense";
    if (transactionType.value === "income") return "income";
    return "neutral";
});

const linkedBadgeVisible = computed(() => isLinkedTransfer.value && transactionType.value !== "transfer");
const hasHeaderActions = computed(() => isEditing.value);
</script>

<template>
    <Dialog :open="open" @update:open="onOpenChange">
        <DialogContent class="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg">
            <DialogHeader class="border-b p-4 pr-12 pb-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex flex-col gap-1">
                        <DialogTitle>
                            {{ isEditing ? t("transactions.form.editTitle") : t("transactions.form.newTitle") }}
                        </DialogTitle>
                        <DialogDescription v-if="!isEditing">
                            {{ t("transactions.form.newDescription") }}
                        </DialogDescription>
                        <Badge v-if="linkedBadgeVisible" variant="secondary" class="mt-1 gap-1">
                            <Icon class="h-3 w-3" name="iconoir:link" />
                            {{ t("transactions.form.linkedTransaction") }}
                        </Badge>
                    </div>
                    <DropdownMenu v-if="hasHeaderActions">
                        <DropdownMenuTrigger as-child>
                            <Button variant="ghost" size="icon-sm" type="button" class="shrink-0">
                                <Icon name="iconoir:more-vert" class="h-4 w-4" />
                                <span class="sr-only">{{ t("transactions.form.actions") }}</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" class="w-56">
                            <template v-if="!isRebalance">
                                <template v-if="isLinkedTransfer">
                                    <DropdownMenuItem @select="viewLinkedTransaction">
                                        <Icon name="iconoir:eye" class="h-4 w-4" />
                                        {{ t("transactions.form.viewLinked") }}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem :disabled="isUnlinking" @select="unlinkTransfer">
                                        <Icon name="iconoir:link-slash" class="h-4 w-4" />
                                        {{ t("transactions.form.unlinkTransfer") }}
                                    </DropdownMenuItem>
                                </template>
                                <DropdownMenuItem v-else @select="isLinkTransferSheetOpen = true">
                                    <Icon name="iconoir:link" class="h-4 w-4" />
                                    {{ t("transactions.form.linkTransfer") }}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </template>
                            <DropdownMenuItem class="text-destructive focus:text-destructive" @select="confirmDelete">
                                <Icon name="iconoir:trash" class="h-4 w-4" />
                                {{ t("common.delete") }}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </DialogHeader>

            <div class="flex-1 overflow-y-auto">
                <div class="flex flex-col gap-5 p-4">
                    <Alert v-if="isRebalance" variant="default" class="bg-muted/50">
                        <AlertTitle class="flex items-center gap-2">
                            <Icon class="h-4 w-4" name="iconoir:warning-triangle" />
                            {{ t("transactions.form.systemTransaction") }}
                        </AlertTitle>
                        <AlertDescription>
                            {{ t("transactions.form.systemTransactionDescription") }}
                        </AlertDescription>
                    </Alert>

                    <div
                        role="tablist"
                        :aria-label="t('transactions.filters.type')"
                        class="bg-muted/50 grid grid-cols-3 gap-1 rounded-lg p-1"
                        :class="{'grid-cols-2': typeOptions.length === 2}">
                        <button
                            v-for="opt in typeOptions"
                            :key="opt.value"
                            type="button"
                            role="tab"
                            :aria-selected="transactionType === opt.value"
                            :disabled="isRebalance"
                            :class="
                                cn(
                                    'flex items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-sm font-medium transition-all',
                                    'hover:bg-background/50 disabled:cursor-not-allowed disabled:opacity-50',
                                    transactionType === opt.value ? opt.activeClass : 'text-muted-foreground',
                                )
                            "
                            @click="transactionType = opt.value">
                            <Icon :name="opt.icon" class="h-4 w-4" />
                            <span>{{ opt.label }}</span>
                        </button>
                    </div>

                    <form v-if="transactionType !== 'transfer'" class="flex flex-col gap-5" @submit.prevent="save">
                        <div class="flex flex-col gap-2">
                            <Label class="text-muted-foreground text-xs tracking-wide uppercase" for="tx-form-amount">
                                {{ t("transactions.table.amount") }}
                            </Label>
                            <MoneyInput
                                id="tx-form-amount"
                                v-model="formData.amount"
                                :currency="currency"
                                :locale="locale || 'en-US'"
                                :variant="amountVariant"
                                :disabled="isRebalance"
                                required />
                        </div>

                        <div class="flex flex-col gap-2">
                            <Label for="tx-form-description">{{ t("transactions.table.description") }}</Label>
                            <Input
                                id="tx-form-description"
                                v-model="formData.description"
                                :placeholder="
                                    transactionType === 'income'
                                        ? t('transactions.form.incomeDescriptionPlaceholder')
                                        : t('transactions.form.expenseDescriptionPlaceholder')
                                "
                                :disabled="isRebalance"
                                required />
                        </div>

                        <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                            <div class="flex flex-col gap-2 sm:min-w-56">
                                <Label for="tx-form-date">{{ t("transactions.table.date") }}</Label>
                                <DatePicker
                                    id="tx-form-date"
                                    v-model="formData.date"
                                    :placeholder="t('transactions.filters.pickDateRange')" />
                            </div>

                            <div v-if="!accountId && !isEditing" class="flex flex-1 flex-col gap-2">
                                <Label for="tx-form-account">{{ t("transactions.table.account") }}</Label>
                                <Select v-model="formData.selectedAccountId" required>
                                    <SelectTrigger id="tx-form-account" class="w-full">
                                        <SelectValue :placeholder="t('transactions.form.selectAccount')" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="account in availableAccounts"
                                                :key="account.id"
                                                :value="account.id">
                                                {{ account.name }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <Separator />

                        <div class="flex flex-col gap-4">
                            <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                                {{ t("transactions.form.details") }}
                            </p>

                            <div class="flex flex-col gap-2">
                                <Label for="tx-form-category">{{ t("transactions.table.category") }}</Label>
                                <TransactionReferenceCombobox
                                    id="tx-form-category"
                                    v-model="formData.categoryId"
                                    :items="categoryItems"
                                    :placeholder="t('transactions.form.selectCategory')"
                                    :empty-text="t('transactions.form.noResults')"
                                    :none-label="t('common.none')"
                                    :create-label="t('settings.references.addCategory')"
                                    :disabled="isRebalance"
                                    @create="isCreateCategoryDialogOpen = true" />
                            </div>

                            <div class="flex flex-col gap-2">
                                <Label for="tx-form-merchant">{{ t("transactions.filters.merchant") }}</Label>
                                <TransactionReferenceCombobox
                                    id="tx-form-merchant"
                                    v-model="formData.merchantId"
                                    :items="merchantItems"
                                    :placeholder="t('transactions.form.selectMerchant')"
                                    :empty-text="t('transactions.form.noResults')"
                                    :none-label="t('common.none')"
                                    :create-label="t('settings.references.addMerchant')"
                                    :disabled="isRebalance"
                                    @create="isCreateMerchantDialogOpen = true" />
                            </div>

                            <div class="flex items-start justify-between gap-4 pt-2">
                                <div class="flex flex-col">
                                    <Label for="txInBudget" class="cursor-pointer">
                                        {{ t("transactions.form.inBudget") }}
                                    </Label>
                                    <p class="text-muted-foreground text-xs">
                                        {{ t("transactions.form.inBudgetDescription") }}
                                    </p>
                                </div>
                                <Switch id="txInBudget" v-model="formData.inBudget" :disabled="isRebalance" />
                            </div>
                        </div>
                    </form>

                    <form v-else class="flex flex-col gap-5" @submit.prevent="save">
                        <div class="flex flex-col gap-2">
                            <Label
                                class="text-muted-foreground text-xs tracking-wide uppercase"
                                for="tx-form-transfer-amount">
                                {{ t("transactions.transfer.amount") }}
                            </Label>
                            <MoneyInput
                                id="tx-form-transfer-amount"
                                v-model="transferFormData.amount"
                                :currency="currency"
                                :locale="locale || 'en-US'"
                                variant="neutral"
                                required />
                        </div>

                        <div class="flex flex-col gap-3">
                            <div class="flex flex-col gap-2">
                                <Label for="tx-form-source-account">{{
                                    t("transactions.transfer.sourceAccount")
                                }}</Label>
                                <Select v-model="transferFormData.sourceAccountId" required>
                                    <SelectTrigger id="tx-form-source-account">
                                        <SelectValue :placeholder="t('transactions.form.selectAccount')" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="account in availableAccounts"
                                                :key="account.id"
                                                :value="account.id">
                                                <div class="flex w-full items-center justify-between gap-4">
                                                    <span>{{ account.name }}</span>
                                                    <span class="text-muted-foreground text-xs tabular-nums">
                                                        {{ formatCurrency(account.balance) }}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <p v-if="sourceAccount" class="text-muted-foreground text-xs">
                                    {{ t("transactions.table.amount") }}:
                                    <span class="tabular-nums">{{ formatCurrency(sourceAccount.balance) }}</span>
                                </p>
                            </div>

                            <div class="flex justify-center py-1" aria-hidden="true">
                                <div class="bg-muted flex h-8 w-8 items-center justify-center rounded-full">
                                    <Icon name="iconoir:arrow-down" class="h-4 w-4" />
                                </div>
                            </div>

                            <div class="flex flex-col gap-2">
                                <Label for="tx-form-destination-account">
                                    {{ t("transactions.transfer.destinationAccount") }}
                                </Label>
                                <Select v-model="transferFormData.destinationAccountId" required>
                                    <SelectTrigger id="tx-form-destination-account">
                                        <SelectValue :placeholder="t('transactions.form.selectAccount')" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="account in destinationAccounts"
                                                :key="account.id"
                                                :value="account.id">
                                                <div class="flex w-full items-center justify-between gap-4">
                                                    <span>{{ account.name }}</span>
                                                    <span class="text-muted-foreground text-xs tabular-nums">
                                                        {{ formatCurrency(account.balance) }}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <p v-if="destinationAccount" class="text-muted-foreground text-xs">
                                    {{ t("transactions.table.amount") }}:
                                    <span class="tabular-nums">{{ formatCurrency(destinationAccount.balance) }}</span>
                                </p>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div class="flex flex-col gap-2">
                                <Label for="tx-form-transfer-description">{{
                                    t("transactions.table.description")
                                }}</Label>
                                <Input
                                    id="tx-form-transfer-description"
                                    v-model="transferFormData.description"
                                    :placeholder="t('transactions.transfer.descriptionPlaceholder')" />
                            </div>
                            <div class="flex flex-col gap-2">
                                <Label for="tx-form-transfer-date">{{ t("transactions.table.date") }}</Label>
                                <DatePicker
                                    id="tx-form-transfer-date"
                                    v-model="transferFormData.date"
                                    :placeholder="t('transactions.filters.pickDateRange')" />
                            </div>
                        </div>

                        <Separator />

                        <div class="flex items-start justify-between gap-4">
                            <div class="flex flex-col">
                                <Label for="transferInBudget" class="cursor-pointer">
                                    {{ t("transactions.form.inBudget") }}
                                </Label>
                                <p class="text-muted-foreground text-xs">
                                    {{ t("transactions.form.inBudgetDescription") }}
                                </p>
                            </div>
                            <Switch id="transferInBudget" v-model="transferFormData.inBudget" />
                        </div>
                    </form>
                </div>
            </div>

            <DialogFooter class="border-t p-4">
                <Button type="button" variant="outline" @click="emit('update:open', false)">
                    {{ t("common.cancel") }}
                </Button>
                <Button :disabled="isSubmitting || isDeleting || !canSubmit" type="button" @click="save">
                    {{
                        isSubmitting
                            ? t("common.saving")
                            : isEditing
                              ? t("transactions.form.saveChanges")
                              : transactionType === "transfer"
                                ? t("transactions.transfer.create")
                                : t("transactions.form.saveChanges")
                    }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="isDeleteDialogOpen">
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>
                    {{
                        isLinkedTransfer
                            ? t("transactions.form.deleteTransferTitle")
                            : t("transactions.form.deleteTitle")
                    }}
                </AlertDialogTitle>
                <AlertDialogDescription>
                    {{
                        isLinkedTransfer
                            ? t("transactions.form.deleteTransferDescription")
                            : t("transactions.form.deleteDescription")
                    }}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div v-if="isLinkedTransfer" class="mb-4 flex items-center gap-2">
                <Switch
                    id="keepLinked"
                    v-model="keepLinkedTransaction"
                    :aria-label="t('transactions.form.keepLinked')" />
                <Label class="cursor-pointer" for="keepLinked">
                    {{ t("transactions.form.keepLinked") }}
                </Label>
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel :disabled="isDeleting">{{ t("common.cancel") }}</AlertDialogCancel>
                <AlertDialogAction
                    :disabled="isDeleting"
                    class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    @click="executeDelete">
                    {{
                        isDeleting
                            ? t("common.deleting")
                            : isLinkedTransfer && !keepLinkedTransaction
                              ? t("transactions.form.deleteBoth")
                              : t("common.delete")
                    }}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>

    <CategoryDialog
        :open="isCreateCategoryDialogOpen"
        @saved="handleCategoryCreated"
        @update:open="isCreateCategoryDialogOpen = $event" />

    <MerchantDialog
        :open="isCreateMerchantDialogOpen"
        @saved="handleMerchantCreated"
        @update:open="isCreateMerchantDialogOpen = $event" />

    <TransactionLinkTransferSheet
        :open="isLinkTransferSheetOpen"
        :transaction="transaction"
        @linked="onLinkTransferDone"
        @update:open="isLinkTransferSheetOpen = $event" />
</template>
