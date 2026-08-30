<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import type {Account} from "~/stores/account.store";
import {useAccountStore} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import {cn} from "~/lib/utils";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Button} from "~/components/ui/button";
import {Input} from "~/components/ui/input";
import {Label} from "~/components/ui/label";
import {Switch} from "~/components/ui/switch";
import MoneyInput from "~/components/common/MoneyInput.vue";

const props = defineProps<{
    open: boolean;
    account?: Account | null;
}>();

const emit = defineEmits<{
    "update:open": [value: boolean];
    saved: [];
}>();

const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const isLoading = ref(false);
const {t, locale} = useI18n();

const NAME_MIN = 3;
const NAME_MAX = 50;

const typeOptions = [
    {value: "CHECKING", icon: "iconoir:wallet", labelKey: "accounts.types.checking"},
    {value: "SAVINGS", icon: "iconoir:piggy-bank", labelKey: "accounts.types.savings"},
    {value: "INVESTMENT", icon: "iconoir:stats-up-square", labelKey: "accounts.types.investment"},
    {value: "CREDIT", icon: "iconoir:credit-card", labelKey: "accounts.types.credit"},
    {value: "CASH", icon: "iconoir:cash", labelKey: "accounts.types.cash"},
    {value: "OTHER", icon: "iconoir:more-horiz-circle", labelKey: "accounts.types.other"},
] as const;

const formData = ref({
    name: "",
    type: "CHECKING" as (typeof typeOptions)[number]["value"],
    balance: 0,
    inBudget: true,
});

const touched = ref<{name: boolean; balance: boolean}>({name: false, balance: false});

const resetForm = () => {
    if (props.account) {
        formData.value = {
            name: props.account.name,
            type: props.account.type as (typeof typeOptions)[number]["value"],
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
    touched.value = {name: false, balance: false};
};

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) resetForm();
    },
);

const currency = computed(() => familyStore.family?.currency || "USD");

const nameError = computed(() => {
    const name = formData.value.name.trim();
    if (name.length === 0) return t("accounts.form.errors.nameTooShort");
    if (name.length < NAME_MIN) return t("accounts.form.errors.nameTooShort");
    if (name.length > NAME_MAX) return t("accounts.form.errors.nameTooLong");
    return null;
});

const balanceError = computed(() => {
    const bal = formData.value.balance;
    if (bal === null || bal === undefined || Number.isNaN(bal)) {
        return t("accounts.form.errors.balanceInvalid");
    }
    return null;
});

const isValid = computed(() => !nameError.value && (!!props.account || !balanceError.value));

const typeCardClass = (value: string) =>
    cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        formData.value.type === value
            ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
            : "border-input hover:bg-accent hover:text-accent-foreground",
    );

const onTypeKeyNav = (e: KeyboardEvent) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const idx = typeOptions.findIndex((o) => o.value === formData.value.type);
    let next: number;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = typeOptions.length - 1;
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % typeOptions.length;
    else next = (idx - 1 + typeOptions.length) % typeOptions.length;
    formData.value.type = typeOptions[next]!.value;
    const container = (e.currentTarget as HTMLElement).parentElement;
    container?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
};

const submitForm = async () => {
    touched.value.name = true;
    touched.value.balance = true;
    if (!isValid.value) return;

    isLoading.value = true;
    try {
        if (props.account) {
            await accountStore.updateAccount(props.account.id, {
                name: formData.value.name.trim(),
                type: formData.value.type,
                inBudget: formData.value.inBudget,
            });
        } else {
            await accountStore.createAccount({
                name: formData.value.name.trim(),
                type: formData.value.type,
                balance: formData.value.balance,
                inBudget: formData.value.inBudget,
            });
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
                <DialogDescription>
                    {{ account ? t("accounts.form.editDescription") : t("accounts.form.addDescription") }}
                </DialogDescription>
            </DialogHeader>

            <form class="space-y-5 py-4" novalidate @submit.prevent="submitForm">
                <fieldset :disabled="isLoading" class="space-y-5">
                    <!-- Name -->
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <Label for="name">{{ t("accounts.form.name") }}</Label>
                            <span
                                class="text-xs tabular-nums"
                                :class="formData.name.length > NAME_MAX ? 'text-destructive' : 'text-muted-foreground'">
                                {{ formData.name.length }}/{{ NAME_MAX }}
                            </span>
                        </div>
                        <Input
                            id="name"
                            v-model="formData.name"
                            :aria-invalid="touched.name && !!nameError"
                            aria-describedby="name-error"
                            autofocus
                            :placeholder="t('accounts.form.namePlaceholder')"
                            required
                            @blur="touched.name = true" />
                        <p
                            v-if="touched.name && nameError"
                            id="name-error"
                            class="text-destructive text-xs"
                            role="alert">
                            {{ nameError }}
                        </p>
                    </div>

                    <!-- Type cards -->
                    <div class="space-y-2">
                        <Label>{{ t("accounts.form.type") }}</Label>
                        <div
                            :aria-label="t('accounts.form.type')"
                            class="grid grid-cols-2 gap-2 sm:grid-cols-3"
                            role="radiogroup">
                            <button
                                v-for="option in typeOptions"
                                :key="option.value"
                                :aria-checked="formData.type === option.value"
                                :class="typeCardClass(option.value)"
                                role="radio"
                                :tabindex="formData.type === option.value ? 0 : -1"
                                type="button"
                                @click="formData.type = option.value"
                                @keydown="onTypeKeyNav">
                                <Icon :name="option.icon" class="h-5 w-5" />
                                <span>{{ t(option.labelKey) }}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Opening balance (creation only) -->
                    <div v-if="!account" class="space-y-2">
                        <Label for="balance">{{ t("accounts.form.openingBalance") }}</Label>
                        <MoneyInput
                            id="balance"
                            v-model="formData.balance"
                            allow-negative
                            :aria-invalid="touched.balance && !!balanceError"
                            aria-describedby="balance-hint balance-error"
                            :currency="currency"
                            :locale="locale || 'en-US'"
                            required
                            size="sm"
                            @blur="touched.balance = true" />
                        <p id="balance-hint" class="text-muted-foreground text-xs">
                            {{ t("accounts.form.openingBalanceHint") }}
                        </p>
                        <p
                            v-if="touched.balance && balanceError"
                            id="balance-error"
                            class="text-destructive text-xs"
                            role="alert">
                            {{ balanceError }}
                        </p>
                    </div>

                    <!-- In budget -->
                    <div class="flex items-start justify-between gap-3 rounded-lg border p-3">
                        <div class="space-y-1">
                            <Label class="cursor-pointer" for="inBudget">{{ t("accounts.form.inBudget") }}</Label>
                            <p class="text-muted-foreground text-xs">
                                {{ t("accounts.form.inBudgetDescription") }}
                            </p>
                        </div>
                        <Switch id="inBudget" v-model="formData.inBudget" />
                    </div>
                </fieldset>

                <DialogFooter>
                    <Button type="button" variant="outline" @click="$emit('update:open', false)">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="isLoading || !isValid" type="submit">
                        <Icon v-if="isLoading" class="h-4 w-4 animate-spin" name="iconoir:refresh" />
                        {{ isLoading ? t("common.saving") : t("common.save") }}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>
</template>
