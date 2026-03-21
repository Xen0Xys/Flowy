<script setup lang="ts">
import {ref, watch} from "vue";
import {useAccountStore} from "~/stores/account.store";
import type {Account} from "~/stores/account.store";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter} from "~/components/ui/dialog";
import {Button} from "~/components/ui/button";
import {Input} from "~/components/ui/input";
import {Label} from "~/components/ui/label";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";

const props = defineProps<{
    open: boolean;
    account?: Account | null;
}>();

const emit = defineEmits<{
    "update:open": [value: boolean];
    saved: [];
}>();

const accountStore = useAccountStore();
const isLoading = ref(false);

const formData = ref({
    name: "",
    type: "CHECKING",
    balance: 0,
});

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            if (props.account) {
                formData.value = {
                    name: props.account.name,
                    type: props.account.type,
                    balance: props.account.balance,
                };
            } else {
                formData.value = {
                    name: "",
                    type: "CHECKING",
                    balance: 0,
                };
            }
        }
    },
);

const submitForm = async () => {
    if (!formData.value.name || !formData.value.type) return;

    isLoading.value = true;
    try {
        if (props.account) {
            await accountStore.updateAccount(props.account.id, formData.value);
        } else {
            await accountStore.createAccount(formData.value);
        }
        emit("saved");
        emit("update:open", false);
    } catch (err) {
        console.error(err);
    } finally {
        isLoading.value = false;
    }
};
</script>

<template>
    <Dialog :open="open" @update:open="$emit('update:open', $event)">
        <DialogContent class="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>{{ account ? "Edit account" : "Add account" }}</DialogTitle>
                <DialogDescription> Fill in your bank account details. </DialogDescription>
            </DialogHeader>

            <form @submit.prevent="submitForm" class="space-y-4 py-4">
                <div class="space-y-2">
                    <Label for="name">Account name</Label>
                    <Input id="name" v-model="formData.name" placeholder="Ex: Checking Account" required />
                </div>

                <div class="space-y-2">
                    <Label for="type">Category / Type</Label>
                    <Select v-model="formData.type">
                        <SelectTrigger>
                            <SelectValue placeholder="Select a type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="CHECKING">Checking</SelectItem>
                            <SelectItem value="SAVINGS">Savings</SelectItem>
                            <SelectItem value="INVESTMENT">Investment</SelectItem>
                            <SelectItem value="CREDIT">Credit</SelectItem>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div class="space-y-2">
                    <Label for="balance">Balance ({{ account ? "current" : "initial" }})</Label>
                    <Input id="balance" type="number" step="0.01" v-model.number="formData.balance" required />
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" @click="$emit('update:open', false)">Cancel</Button>
                    <Button type="submit" :disabled="isLoading">
                        {{ isLoading ? "Saving..." : "Save" }}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>
</template>
