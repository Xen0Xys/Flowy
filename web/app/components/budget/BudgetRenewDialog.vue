<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import type {Budget, RenewableBudget} from "~/stores/budget.store";
import {useBudgetStore} from "~/stores/budget.store";
import {Button} from "~/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";

const props = defineProps<{
    open: boolean;
    renewableBudgets: RenewableBudget[];
}>();

const emit = defineEmits<{
    "update:open": [value: boolean];
    renew: [budget: Budget];
}>();

const {t, locale} = useI18n();
const budgetStore = useBudgetStore();

const selectedBudgetId = ref<string>("");
const isLoading = ref(false);

const monthFormatter = computed(() => {
    return new Intl.DateTimeFormat(locale.value ?? "en-US", {month: "long"});
});

const formattedBudgets = computed(() => {
    return props.renewableBudgets.map((b) => {
        const period = `${monthFormatter.value.format(new Date(b.year, b.month - 1, 1))} ${b.year}`;
        const name = b.name && b.name.trim().length > 0 ? b.name : t("budget.renewDialog.unnamedBudget");
        const suffix = b.effectivePermission === "owner" ? "" : t("budget.renewDialog.sharedSuffix");
        return {
            id: b.id,
            label: `${period} · ${name}${suffix}`,
        };
    });
});

watch(
    () => props.open,
    (open) => {
        if (open) {
            selectedBudgetId.value = "";
        }
    },
);

async function handleRenew() {
    if (!selectedBudgetId.value) return;

    isLoading.value = true;
    try {
        const source = await budgetStore.getBudgetById(selectedBudgetId.value);
        if (source.effectivePermission === "read") {
            toast.error(t("budget.renewDialog.errors.readOnlySource"));
            return;
        }
        emit("renew", source);
        emit("update:open", false);
    } catch (err) {
        console.error(err);
    } finally {
        isLoading.value = false;
    }
}
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent class="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>{{ t("budget.renewDialog.title") }}</DialogTitle>
                <DialogDescription>{{ t("budget.renewDialog.description") }}</DialogDescription>
            </DialogHeader>

            <div class="grid gap-4 py-4">
                <div class="grid gap-2">
                    <Select v-model="selectedBudgetId">
                        <SelectTrigger>
                            <SelectValue :placeholder="t('budget.renewDialog.selectPlaceholder')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-if="formattedBudgets.length === 0" value="__none__" disabled>
                                {{ t("budget.page.noPreviousBudget") }}
                            </SelectItem>
                            <SelectItem v-for="b in formattedBudgets" :key="b.id" :value="b.id">
                                {{ b.label }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="emit('update:open', false)">{{ t("common.cancel") }}</Button>
                <Button :disabled="!selectedBudgetId || isLoading" @click="handleRenew">
                    {{ t("budget.renewDialog.continue") }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
