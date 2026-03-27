<script setup lang="ts">
import {ref, watch, computed} from "vue";
import {
    useTransactionStore,
    type Transaction,
    type UpdateTransactionPayload,
    type CreateTransactionPayload,
} from "~/stores/transaction.store";
import {useReferenceStore} from "~/stores/reference.store";
import {useApi} from "~/composables/useApi";
import {Button} from "~/components/ui/button";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {Input} from "~/components/ui/input";
import {Label} from "~/components/ui/label";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Badge} from "~/components/ui/badge";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter} from "~/components/ui/dialog";
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
const {apiFetch} = useApi();

const isSubmitting = ref(false);
const isDeleteDialogOpen = ref(false);
const isDeleting = ref(false);

const loadReferences = async () => {
    try {
        await referenceStore.fetchReferences();
    } catch (e) {
        console.error("Failed to load reference data", e);
    }
};

const availableCategories = computed(() => referenceStore.categories);
const availableMerchants = computed(() => referenceStore.merchants);

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen && availableCategories.value.length === 0) {
            loadReferences();
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
            };
        } else {
            transactionType.value = "expense";
            formData.value = {
                amount: 0,
                description: "",
                date: new Date().toISOString().split("T")[0],
                categoryId: "none",
                merchantId: "none",
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
            if (!props.accountId) {
                throw new Error("accountId is required to create a transaction");
            }
            await transactionStore.createTransaction(props.accountId, payload);
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

            <form @submit.prevent="save" class="grid gap-4 py-4">
                <div class="grid grid-cols-4 items-center gap-4">
                    <Label for="amount" class="text-right"> Amount </Label>
                    <div class="col-span-3">
                        <Input id="amount" v-model.number="formData.amount" type="number" step="0.01" min="0" required />
                    </div>
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label for="description" class="text-right"> Description </Label>
                    <Input id="description" v-model="formData.description" class="col-span-3" required />
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label for="date" class="text-right"> Date </Label>
                    <Input id="date" v-model="formData.date" type="date" class="col-span-3" required />
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label for="category" class="text-right"> Category </Label>
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
                                            <Icon :name="cat.icon" class="h-4 w-4" :style="{color: cat.hexColor}" />
                                            <span>{{ cat.name }}</span>
                                        </div>
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label for="merchant" class="text-right"> Merchant </Label>
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
                    type="button"
                    variant="destructive"
                    @click="confirmDelete"
                    :disabled="isSubmitting || isDeleting">
                    <Icon name="iconoir:trash" class="mr-2 h-4 w-4" />
                    Delete
                </Button>
                <div v-else></div>
                <!-- spacer for justify-between -->

                <div class="flex items-center gap-2">
                    <Button type="button" variant="outline" @click="emit('update:open', false)"> Cancel </Button>
                    <Button type="submit" @click="save" :disabled="isSubmitting || isDeleting">
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
                    class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    :disabled="isDeleting"
                    @click="executeDelete">
                    {{ isDeleting ? "Deleting..." : "Delete" }}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
</template>
