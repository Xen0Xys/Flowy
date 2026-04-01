<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {
    type CreateTransactionPayload,
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
import {Icon} from "#components";

const props = defineProps<{
    open: boolean;
    transaction: Transaction | null;
    accountId?: string;
}>();

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "saved"): void;
}>();

const transactionStore = useTransactionStore();
const referenceStore = useReferenceStore();
const accountStore = useAccountStore();
const {apiFetch} = useApi();

const isSubmitting = ref(false);
const isDeleteDialogOpen = ref(false);
const isDeleting = ref(false);

const loadData = async () => {
    try {
        await Promise.all([
            referenceStore.fetchReferences(),
            !props.accountId ? accountStore.fetchAccounts() : Promise.resolve(),
        ]);
    } catch (e) {
        console.error("Failed to load required data", e);
    }
};

const availableCategories = computed(() => referenceStore.categories);
const availableMerchants = computed(() => referenceStore.merchants);
const availableAccounts = computed(() => accountStore.accounts);

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            loadData();
        }
    },
    {immediate: true},
);

const formData = ref({
    amount: 0,
    description: "",
    date: "",
    categoryId: "none",
    merchantId: "none",
    selectedAccountId: "",
});

const transactionType = ref<"expense" | "income">("expense");

watch(
    () => props.transaction,
    (newTransaction) => {
        if (newTransaction) {
            transactionType.value = newTransaction.amount < 0 ? "expense" : "income";
            formData.value = {
                amount: Math.abs(newTransaction.amount),
                description: newTransaction.description,
                date: newTransaction.date ? new Date(newTransaction.date).toISOString().split("T")[0] : "",
                categoryId: newTransaction.category?.id || "none",
                merchantId: newTransaction.merchant?.id || "none",
                selectedAccountId: newTransaction.accountId || props.accountId || "",
            };
        } else {
            transactionType.value = "expense";
            formData.value = {
                amount: 0,
                description: "",
                date: new Date().toISOString().split("T")[0],
                categoryId: "none",
                merchantId: "none",
                selectedAccountId: props.accountId || "",
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
                throw new Error("Account is required to create a transaction");
            }
            await transactionStore.createTransaction(targetAccountId, payload);
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
        await transactionStore.deleteTransaction(props.transaction.id);
        isDeleteDialogOpen.value = false;
        emit("saved");
        emit("update:open", false);
    } catch (err) {
        console.error(err);
    } finally {
        isDeleting.value = false;
    }
};
</script>

<template>
    <Dialog :open="open" @update:open="onOpenChange">
        <DialogContent class="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>{{ props.transaction ? "Edit Transaction" : "New Transaction" }}</DialogTitle>
                <DialogDescription>
                    {{
                        props.transaction
                            ? "Update the details of this transaction. Click save when you're done."
                            : "Add a new transaction. Click save when you're done."
                    }}
                </DialogDescription>
            </DialogHeader>

            <Tabs v-model="transactionType" class="mt-4 w-full">
                <TabsList class="grid w-full grid-cols-2">
                    <TabsTrigger value="expense">Expense</TabsTrigger>
                    <TabsTrigger value="income">Income</TabsTrigger>
                </TabsList>
            </Tabs>

            <Alert v-if="props.transaction?.isRebalance" class="bg-muted/50 mt-4" variant="default">
                <AlertTitle>System Transaction</AlertTitle>
                <AlertDescription>
                    This is an automatic balance adjustment. Modifying it may cause your account balance to fall out of
                    sync.
                </AlertDescription>
            </Alert>

            <form class="grid gap-4 py-4" @submit.prevent="save">
                <div v-if="!props.accountId && !props.transaction" class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="account"> Account </Label>
                    <div class="col-span-3">
                        <Select v-model="formData.selectedAccountId" required>
                            <SelectTrigger>
                                <SelectValue placeholder="Select an account" />
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
                    <Label class="text-right" for="amount"> Amount </Label>
                    <div class="col-span-3">
                        <Input id="amount" v-model.number="formData.amount" min="0" required step="0.01" type="number" />
                    </div>
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="description"> Description </Label>
                    <Input id="description" v-model="formData.description" class="col-span-3" required />
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="date"> Date </Label>
                    <Input id="date" v-model="formData.date" class="col-span-3" required type="date" />
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="category"> Category </Label>
                    <div class="col-span-3">
                        <Select v-model="formData.categoryId">
                            <SelectTrigger>
                                <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem v-for="cat in availableCategories" :key="cat.id" :value="cat.id">
                                        <div class="flex items-center gap-2">
                                            <Icon :name="cat.icon" :style="{color: cat.hexColor}" class="h-4 w-4" />
                                            <span>{{ cat.name }}</span>
                                        </div>
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right" for="merchant"> Merchant </Label>
                    <div class="col-span-3">
                        <Select v-model="formData.merchantId">
                            <SelectTrigger>
                                <SelectValue placeholder="Select a merchant" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem
                                        v-for="merchant in availableMerchants"
                                        :key="merchant.id"
                                        :value="merchant.id">
                                        {{ merchant.name }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </form>

            <DialogFooter class="flex w-full items-center sm:justify-between">
                <Button
                    v-if="props.transaction"
                    :disabled="isSubmitting || isDeleting"
                    type="button"
                    variant="destructive"
                    @click="confirmDelete">
                    <Icon class="mr-2 h-4 w-4" name="iconoir:trash" />
                    Delete
                </Button>
                <div v-else></div>
                <!-- spacer for justify-between -->

                <div class="flex items-center gap-2">
                    <Button type="button" variant="outline" @click="emit('update:open', false)"> Cancel </Button>
                    <Button :disabled="isSubmitting || isDeleting" type="submit" @click="save">
                        {{ isSubmitting ? "Saving..." : "Save changes" }}
                    </Button>
                </div>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <AlertDialog :open="isDeleteDialogOpen" @update:open="isDeleteDialogOpen = $event">
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Delete transaction</AlertDialogTitle>
                <AlertDialogDescription>
                    Are you sure you want to delete this transaction? This action cannot be undone.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel :disabled="isDeleting">Cancel</AlertDialogCancel>
                <AlertDialogAction
                    :disabled="isDeleting"
                    class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    @click="executeDelete">
                    {{ isDeleting ? "Deleting..." : "Delete" }}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
</template>
