<script lang="ts" setup>
import {ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import type {Account} from "~/stores/account.store";
import {useAccountStore} from "~/stores/account.store";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Button} from "~/components/ui/button";
import {Input} from "~/components/ui/input";
import {Label} from "~/components/ui/label";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Switch} from "~/components/ui/switch";

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
const {t} = useI18n();

const formData = ref({
    name: "",
    type: "CHECKING",
    balance: 0,
    inBudget: true,
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
                    inBudget: props.account.inBudget ?? true,
                };
            } else {
                formData.value = {
                    name: "",
                    type: "CHECKING",
                    balance: 0,
                    inBudget: true,
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
        <DialogContent class="sm:max-w-106.25">
            <DialogHeader>
                <DialogTitle>{{ account ? t("accounts.form.editTitle") : t("accounts.form.addTitle") }}</DialogTitle>
                <DialogDescription>{{ t("accounts.form.description") }}</DialogDescription>
            </DialogHeader>

            <form class="space-y-4 py-4" @submit.prevent="submitForm">
                <div class="space-y-2">
                    <Label for="name">{{ t("accounts.form.name") }}</Label>
                    <Input
                        id="name"
                        v-model="formData.name"
                        :placeholder="t('accounts.form.namePlaceholder')"
                        required />
                </div>

                <div class="space-y-2">
                    <Label for="type">{{ t("accounts.form.type") }}</Label>
                    <Select v-model="formData.type">
                        <SelectTrigger>
                            <SelectValue :placeholder="t('accounts.form.selectType')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="CHECKING">{{ t("accounts.types.checking") }}</SelectItem>
                            <SelectItem value="SAVINGS">{{ t("accounts.types.savings") }}</SelectItem>
                            <SelectItem value="INVESTMENT">{{ t("accounts.types.investment") }}</SelectItem>
                            <SelectItem value="CREDIT">{{ t("accounts.types.credit") }}</SelectItem>
                            <SelectItem value="CASH">{{ t("accounts.types.cash") }}</SelectItem>
                            <SelectItem value="OTHER">{{ t("accounts.types.other") }}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div class="space-y-2">
                    <Label for="balance">
                        {{ t("accounts.form.balance") }} ({{
                            account ? t("accounts.form.current") : t("accounts.form.initial")
                        }})
                    </Label>
                    <Input id="balance" v-model.number="formData.balance" required step="0.01" type="number" />
                </div>

                <div class="flex items-center gap-2 space-y-0">
                    <Switch id="inBudget" v-model="formData.inBudget" />
                    <Label for="inBudget">{{ t("accounts.form.inBudget") }}</Label>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" @click="$emit('update:open', false)">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="isLoading" type="submit">
                        {{ isLoading ? t("common.saving") : t("common.save") }}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>
</template>
