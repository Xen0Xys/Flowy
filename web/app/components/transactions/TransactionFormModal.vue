<script lang="ts" setup>
import {computed, ref, watch} from "vue";
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
import {useApi} from "~/composables/useApi";
import {Button} from "~/components/ui/button";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {Input} from "~/components/ui/input";
import {Label} from "~/components/ui/label";
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
import CategoryDialog from "~/components/references/CategoryDialog.vue";
import MerchantDialog from "~/components/references/MerchantDialog.vue";
import {Icon} from "#components";
import {cn} from "~/lib/utils";

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
const {apiFetch} = useApi();
const {t} = useI18n();

const isSubmitting = ref(false);
const isDeleteDialogOpen = ref(false);
const isDeleting = ref(false);
const isCreateCategoryDialogOpen = ref(false);
const isCreateMerchantDialogOpen = ref(false);
const keepLinkedTransaction = ref(false);
const isUnlinking = ref(false);

// Link transfer state
const isLinkTransferDialogOpen = ref(false);
const selectedLinkAccountId = ref<string>("");
const eligibleTransactions = ref<Transaction[]>([]);
const selectedTransactionId = ref<string>("");
const isLoadingEligibleTransactions = ref(false);
const isLinking = ref(false);

const loadData = async () => {
    try {
        await Promise.all([
            referenceStore.fetchReferences(),
            !props.accountId ? accountStore.fetchAccounts() : Promise.resolve(),
        ]);
    } catch (e: unknown) {
        toast.error(t("transactions.form.errors.loadData"));
    }
};

const availableCategories = computed(() => referenceStore.categories);
const availableMerchants = computed(() => referenceStore.merchants);
const availableAccounts = computed(() => accountStore.accounts);
const destinationAccounts = computed(() =>
    availableAccounts.value.filter((acc) => acc.id !== transferFormData.value.sourceAccountId),
);

// Link transfer computed
const linkableAccounts = computed(() => {
    if (!props.transaction) return [];
    return availableAccounts.value.filter((acc) => acc.id !== props.transaction?.accountId);
});

const formattedTransactionAmount = computed(() => {
    if (!props.transaction) return "0.00";
    return Math.abs(props.transaction.amount).toFixed(2);
});

const formattedTransactionDate = computed(() => {
    if (!props.transaction?.date) return "";
    return new Date(props.transaction.date).toLocaleDateString();
});

const selectedAccountName = computed(() => {
    const account = availableAccounts.value.find((acc) => acc.id === selectedLinkAccountId.value);
    return account?.name || "";
});

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            loadData();
            resetForm();
        }
    },
    {immediate: true},
);

const resetForm = () => {
    keepLinkedTransaction.value = false;
    if (props.transaction) {
        transactionType.value = props.transaction.amount < 0 ? "expense" : "income";
        formData.value = {
            amount: Math.abs(props.transaction.amount),
            description: props.transaction.description,
            date: props.transaction.date ? new Date(props.transaction.date).toISOString().split("T")[0] || "" : "",
            categoryId: props.transaction.category?.id || "none",
            merchantId: props.transaction.merchant?.id || "none",
            selectedAccountId: props.transaction.accountId || props.accountId || "",
        };
    } else {
        transactionType.value = "expense";
        formData.value = {
            amount: 0,
            description: "",
            date: new Date().toISOString().split("T")[0] || "",
            categoryId: "none",
            merchantId: "none",
            selectedAccountId: props.accountId || "",
        };
        transferFormData.value = {
            sourceAccountId: props.accountId || "",
            destinationAccountId: "",
            amount: 0,
            description: "",
            date: new Date().toISOString().split("T")[0] || "",
        };
    }
};

const formData = ref({
    amount: 0,
    description: "",
    date: "",
    categoryId: "none",
    merchantId: "none",
    selectedAccountId: "",
});

const transferFormData = ref({
    sourceAccountId: "",
    destinationAccountId: "",
    amount: 0,
    description: "",
    date: "",
});

const transactionType = ref<"expense" | "income" | "transfer">("expense");

watch(
    () => props.transaction,
    (newTransaction) => {
        keepLinkedTransaction.value = false;
        if (newTransaction) {
            transactionType.value = newTransaction.amount < 0 ? "expense" : "income";
            formData.value = {
                amount: Math.abs(newTransaction.amount),
                description: newTransaction.description,
                date: newTransaction.date ? new Date(newTransaction.date).toISOString().split("T")[0] || "" : "",
                categoryId: newTransaction.category?.id || "none",
                merchantId: newTransaction.merchant?.id || "none",
                selectedAccountId: newTransaction.accountId || props.accountId || "",
            };
        } else {
            transactionType.value = "expense";
            formData.value = {
                amount: 0,
                description: "",
                date: new Date().toISOString().split("T")[0] || "",
                categoryId: "none",
                merchantId: "none",
                selectedAccountId: props.accountId || "",
            };
            transferFormData.value = {
                sourceAccountId: props.accountId || "",
                destinationAccountId: "",
                amount: 0,
                description: "",
                date: new Date().toISOString().split("T")[0] || "",
            };
        }
    },
    {immediate: true},
);

const onOpenChange = (open: boolean) => {
    emit("update:open", open);
};

const save = async () => {
    isSubmitting.value = true;
    try {
        if (transactionType.value === "transfer") {
            if (
                !transferFormData.value.sourceAccountId ||
                !transferFormData.value.destinationAccountId ||
                transferFormData.value.sourceAccountId === transferFormData.value.destinationAccountId
            ) {
                toast.error(t("transactions.transfer.sameAccountError"));
                return;
            }

            const payload: CreateTransferPayload = {
                debitAccountId: transferFormData.value.sourceAccountId,
                creditAccountId: transferFormData.value.destinationAccountId,
                amount: Math.abs(Number(transferFormData.value.amount)),
                description: transferFormData.value.description || t("transactions.transfer.badge"),
                date: new Date(transferFormData.value.date).toISOString(),
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
                };
                await transactionStore.updateTransaction(props.transaction.id, payload);
            } else {
                const payload: CreateTransactionPayload = {
                    amount: finalAmount,
                    description: formData.value.description,
                    date: new Date(formData.value.date).toISOString(),
                    categoryId: formData.value.categoryId === "none" ? undefined : formData.value.categoryId,
                    merchantId: formData.value.merchantId === "none" ? undefined : formData.value.merchantId,
                };
                const targetAccountId = props.accountId || formData.value.selectedAccountId;
                if (!targetAccountId) {
                    throw new Error(t("transactions.form.errors.accountRequired"));
                }
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

const handleCategoryCreated = (category: {id: string}) => {
    formData.value.categoryId = category.id;
};

const handleMerchantCreated = (merchant: {id: string}) => {
    formData.value.merchantId = merchant.id;
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

// Link transfer methods
const openLinkTransferDialog = () => {
    selectedLinkAccountId.value = "";
    eligibleTransactions.value = [];
    selectedTransactionId.value = "";
    isLinkTransferDialogOpen.value = true;
};

const fetchEligibleTransactions = async (accountId: string) => {
    if (!props.transaction || !accountId) return;

    isLoadingEligibleTransactions.value = true;
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

        // Filter transactions with opposite sign and same absolute amount
        const targetAmount = Math.abs(props.transaction.amount);
        const oppositeSign = props.transaction.amount < 0 ? "income" : "expense";

        eligibleTransactions.value = result.items.filter((tx) => {
            // Must have opposite sign
            const hasOppositeSign = oppositeSign === "income" ? tx.amount > 0 : tx.amount < 0;
            // Must have same absolute amount
            const hasSameAmount = Math.abs(tx.amount) === targetAmount;
            // Must not already be linked to a transfer
            const isNotLinked = !tx.linkedTransactionId;
            return hasOppositeSign && hasSameAmount && isNotLinked;
        });
    } catch (err) {
        console.error(err);
        toast.error(t("transactions.form.errors.loadData"));
    } finally {
        isLoadingEligibleTransactions.value = false;
    }
};

const handleLinkAccountChange = (accountId: string) => {
    selectedLinkAccountId.value = accountId;
    fetchEligibleTransactions(accountId);
};

const executeLinkTransfer = async () => {
    if (!props.transaction || !selectedTransactionId.value) return;

    isLinking.value = true;
    try {
        await transactionStore.linkTransactions(props.transaction.id, selectedTransactionId.value);
        isLinkTransferDialogOpen.value = false;
        emit("saved");
        emit("update:open", false);
    } catch (err) {
        console.error(err);
    } finally {
        isLinking.value = false;
    }
};
</script>

<template>
    <Dialog :open="open" @update:open="onOpenChange">
        <DialogContent class="sm:max-w-106.25">
            <DialogHeader>
                <DialogTitle>
                    {{ props.transaction ? t("transactions.form.editTitle") : t("transactions.form.newTitle") }}
                </DialogTitle>
                <DialogDescription>
                    {{
                        props.transaction
                            ? t("transactions.form.editDescription")
                            : t("transactions.form.newDescription")
                    }}
                </DialogDescription>
            </DialogHeader>

            <Tabs v-model="transactionType" class="w-full">
                <TabsList :class="props.transaction ? 'grid w-full grid-cols-2' : 'grid w-full grid-cols-3'">
                    <TabsTrigger value="expense">{{ t("transactions.filters.expense") }}</TabsTrigger>
                    <TabsTrigger value="income">{{ t("transactions.filters.income") }}</TabsTrigger>
                    <TabsTrigger v-if="!props.transaction" value="transfer">{{
                        t("transactions.transfer.tab")
                    }}</TabsTrigger>
                </TabsList>
            </Tabs>

            <Alert v-if="props.transaction?.isRebalance" class="bg-muted/50 mt-4" variant="default">
                <AlertTitle>{{ t("transactions.form.systemTransaction") }}</AlertTitle>
                <AlertDescription>
                    {{ t("transactions.form.systemTransactionDescription") }}
                </AlertDescription>
            </Alert>

            <Alert v-if="props.transaction?.linkedTransactionId && transactionType !== 'transfer'" variant="default">
                <AlertTitle class="flex items-center gap-2">
                    <Icon class="h-4 w-4" name="iconoir:link" />
                    {{ t("transactions.form.linkedTransaction") }}
                </AlertTitle>
                <AlertDescription>
                    {{ t("transactions.form.linkedTransactionDescription") }}
                    <div class="mt-3 flex flex-wrap gap-2">
                        <Button
                            :disabled="isUnlinking"
                            :loading="isUnlinking"
                            size="sm"
                            type="button"
                            variant="outline"
                            @click="viewLinkedTransaction">
                            <Icon class="mr-1.5 h-4 w-4" name="iconoir:eye" />
                            {{ t("transactions.form.viewLinked") }}
                        </Button>
                        <Button
                            :disabled="isUnlinking"
                            :loading="isUnlinking"
                            size="sm"
                            type="button"
                            variant="outline"
                            @click="unlinkTransfer">
                            <Icon class="mr-1.5 h-4 w-4" name="iconoir:link-slash" />
                            {{ isUnlinking ? t("transactions.form.unlinking") : t("transactions.form.unlinkTransfer") }}
                        </Button>
                    </div>
                </AlertDescription>
            </Alert>

            <!-- Transfer Form -->
            <form v-if="transactionType === 'transfer'" class="grid gap-4" @submit.prevent="save">
                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="sourceAccount">
                        {{ t("transactions.transfer.sourceAccount") }}
                    </Label>
                    <div class="col-span-3">
                        <Select v-model="transferFormData.sourceAccountId" required>
                            <SelectTrigger id="sourceAccount">
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

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="destinationAccount">
                        {{ t("transactions.transfer.destinationAccount") }}
                    </Label>
                    <div class="col-span-3">
                        <Select v-model="transferFormData.destinationAccountId" required>
                            <SelectTrigger id="destinationAccount">
                                <SelectValue :placeholder="t('transactions.form.selectAccount')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="account in destinationAccounts"
                                        :key="account.id"
                                        :value="account.id">
                                        {{ account.name }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="transferDescription">
                        {{ t("transactions.table.description") }}
                    </Label>
                    <Input
                        id="transferDescription"
                        v-model="transferFormData.description"
                        :placeholder="t('transactions.transfer.descriptionPlaceholder')"
                        class="col-span-3" />
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="transferAmount">
                        {{ t("transactions.transfer.amount") }}
                    </Label>
                    <div class="col-span-3">
                        <Input
                            id="transferAmount"
                            v-model.number="transferFormData.amount"
                            min="0"
                            required
                            step="0.01"
                            type="number" />
                    </div>
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="transferDate"> {{ t("transactions.table.date") }} </Label>
                    <Input id="transferDate" v-model="transferFormData.date" class="col-span-3" required type="date" />
                </div>

                <DialogFooter class="flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" @click="emit('update:open', false)">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="isSubmitting" type="submit">
                        {{ isSubmitting ? t("common.saving") : t("transactions.transfer.create") }}
                    </Button>
                </DialogFooter>
            </form>

            <!-- Standard Transaction Form -->
            <form v-else class="grid gap-4" @submit.prevent="save">
                <div v-if="!props.accountId && !props.transaction" class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="account"> {{ t("transactions.table.account") }} </Label>
                    <div class="col-span-3">
                        <Select v-model="formData.selectedAccountId" required>
                            <SelectTrigger id="account">
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

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="description"> {{ t("transactions.table.description") }} </Label>
                    <Input
                        id="description"
                        v-model="formData.description"
                        :placeholder="
                            transactionType === 'income'
                                ? t('transactions.form.incomeDescriptionPlaceholder')
                                : t('transactions.form.expenseDescriptionPlaceholder')
                        "
                        class="col-span-3"
                        required />
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="amount"> {{ t("transactions.table.amount") }} </Label>
                    <div class="col-span-3">
                        <Input id="amount" v-model.number="formData.amount" min="0" required step="0.01" type="number" />
                    </div>
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="date"> {{ t("transactions.table.date") }} </Label>
                    <Input id="date" v-model="formData.date" class="col-span-3" required type="date" />
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="category"> {{ t("transactions.table.category") }} </Label>
                    <div class="col-span-3">
                        <div class="flex items-center gap-2">
                            <Select v-model="formData.categoryId">
                                <SelectTrigger id="category">
                                    <SelectValue :placeholder="t('transactions.form.selectCategory')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="none">{{ t("common.none") }}</SelectItem>
                                        <SelectItem v-for="cat in availableCategories" :key="cat.id" :value="cat.id">
                                            <div class="flex items-center gap-2">
                                                <Icon :name="cat.icon" :style="{color: cat.hexColor}" class="h-4 w-4" />
                                                <span>{{ cat.name }}</span>
                                            </div>
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <Button
                                :aria-label="t('settings.references.addCategory')"
                                :title="t('settings.references.addCategory')"
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                                @click="isCreateCategoryDialogOpen = true">
                                <Icon class="h-4 w-4" name="iconoir:plus" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="merchant"> {{ t("transactions.filters.merchant") }} </Label>
                    <div class="col-span-3">
                        <div class="flex items-center gap-2">
                            <Select v-model="formData.merchantId">
                                <SelectTrigger id="merchant">
                                    <SelectValue :placeholder="t('transactions.form.selectMerchant')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="none">{{ t("common.none") }}</SelectItem>
                                        <SelectItem
                                            v-for="merchant in availableMerchants"
                                            :key="merchant.id"
                                            :value="merchant.id">
                                            {{ merchant.name }}
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <Button
                                :aria-label="t('settings.references.addMerchant')"
                                :title="t('settings.references.addMerchant')"
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                                @click="isCreateMerchantDialogOpen = true">
                                <Icon class="h-4 w-4" name="iconoir:plus" />
                            </Button>
                        </div>
                    </div>
                </div>

                <DialogFooter class="flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" @click="emit('update:open', false)">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="isSubmitting || isDeleting" type="submit">
                        {{ isSubmitting ? t("common.saving") : t("transactions.form.saveChanges") }}
                    </Button>
                </DialogFooter>

                <!-- Link as Transfer button (only for non-transfer transactions being edited) -->
                <div v-if="props.transaction && !props.transaction.linkedTransactionId" class="border-t pt-4">
                    <Button
                        :disabled="isSubmitting || isDeleting"
                        class="w-full"
                        type="button"
                        variant="outline"
                        @click="openLinkTransferDialog">
                        <Icon class="mr-2 h-4 w-4" name="iconoir:link" />
                        {{ t("transactions.form.linkTransfer") }}
                    </Button>
                </div>
            </form>

            <div v-if="props.transaction" class="border-t pt-4">
                <Button
                    :disabled="isSubmitting || isDeleting"
                    class="w-full"
                    type="button"
                    variant="destructive"
                    @click="confirmDelete">
                    <Icon class="mr-2 h-4 w-4" name="iconoir:trash" />
                    {{ t("common.delete") }}
                </Button>
            </div>
        </DialogContent>
    </Dialog>

    <AlertDialog :open="isDeleteDialogOpen" @update:open="isDeleteDialogOpen = $event">
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>
                    {{
                        props.transaction?.linkedTransactionId
                            ? t("transactions.form.deleteTransferTitle")
                            : t("transactions.form.deleteTitle")
                    }}
                </AlertDialogTitle>
                <AlertDialogDescription>
                    {{
                        props.transaction?.linkedTransactionId
                            ? t("transactions.form.deleteTransferDescription")
                            : t("transactions.form.deleteDescription")
                    }}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div v-if="props.transaction?.linkedTransactionId" class="mb-4 flex items-center gap-2">
                <input id="keepLinked" v-model="keepLinkedTransaction" type="checkbox" />
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
                            : props.transaction?.linkedTransactionId && !keepLinkedTransaction
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

    <!-- Link Transfer Dialog -->
    <Dialog :open="isLinkTransferDialogOpen" @update:open="isLinkTransferDialogOpen = $event">
        <DialogContent class="sm:max-w-106.25">
            <DialogHeader>
                <DialogTitle>{{ t("transactions.transfer.linkTitle") }}</DialogTitle>
                <DialogDescription>
                    {{ t("transactions.transfer.linkDescription") }}
                </DialogDescription>
            </DialogHeader>

            <div class="grid gap-4">
                <!-- Current transaction info -->
                <Alert class="bg-muted/50">
                    <AlertTitle class="flex items-center gap-2">
                        <Icon
                            :name="
                                props.transaction?.amount && props.transaction.amount < 0
                                    ? 'iconoir:folder-minus'
                                    : 'iconoir:folder-plus'
                            "
                            class="h-4 w-4" />
                        {{
                            props.transaction?.amount && props.transaction.amount < 0
                                ? t("transactions.filters.expense")
                                : t("transactions.filters.income")
                        }}
                    </AlertTitle>
                    <AlertDescription>
                        <div class="mt-1 flex flex-col gap-1">
                            <span
                                ><strong>{{ t("transactions.table.amount") }}:</strong>
                                {{ formattedTransactionAmount }}</span
                            >
                            <span
                                ><strong>{{ t("transactions.table.date") }}:</strong>
                                {{ formattedTransactionDate }}</span
                            >
                            <span
                                ><strong>{{ t("transactions.table.description") }}:</strong>
                                {{ props.transaction?.description }}</span
                            >
                        </div>
                    </AlertDescription>
                </Alert>

                <!-- Account selection -->
                <div class="flex items-center gap-4">
                    <Label class="text-right" for="linkAccount">
                        {{ t("transactions.transfer.selectAccount") }}
                    </Label>
                    <div class="">
                        <Select :model-value="selectedLinkAccountId" @update:model-value="handleLinkAccountChange">
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
                </div>

                <!-- Eligible transactions list -->
                <div v-if="selectedLinkAccountId" class="mt-2">
                    <Label class="mb-2 block">
                        {{ t("transactions.transfer.selectTransaction") }}
                    </Label>

                    <!-- Loading state -->
                    <div v-if="isLoadingEligibleTransactions" class="flex items-center justify-center py-8">
                        <Icon class="h-6 w-6 animate-spin" name="iconoir:loading" />
                        <span class="ml-2">{{ t("transactions.transfer.loadingTransactions") }}</span>
                    </div>

                    <!-- Empty state -->
                    <div
                        v-else-if="eligibleTransactions.length === 0"
                        class="text-muted-foreground rounded-md border border-dashed p-6 text-center">
                        {{ t("transactions.transfer.noEligibleTransactions") }}
                    </div>

                    <!-- Transaction list -->
                    <div v-else class="max-h-60 overflow-y-auto rounded-md border">
                        <p class="text-muted-foreground border-b px-3 py-2 text-sm">
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
                                    <Icon v-if="selectedTransactionId === tx.id" class="h-3 w-3" name="iconoir:check" />
                                </div>
                                <div class="flex-1">
                                    <div class="font-medium">{{ tx.description }}</div>
                                    <div class="text-muted-foreground text-sm">
                                        {{ tx.amount > 0 ? "+" : "" }}{{ tx.amount.toFixed(2) }} •
                                        {{ new Date(tx.date).toLocaleDateString() }}
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <DialogFooter class="flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" @click="isLinkTransferDialogOpen = false">
                    {{ t("common.cancel") }}
                </Button>
                <Button :disabled="!selectedTransactionId || isLinking" type="button" @click="executeLinkTransfer">
                    {{ isLinking ? t("transactions.transfer.linkingButton") : t("transactions.transfer.linkButton") }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
