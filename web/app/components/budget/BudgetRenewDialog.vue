<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import type {AvailableMonth, Budget} from "~/stores/budget.store";
import {useBudgetStore} from "~/stores/budget.store";
import {Button} from "~/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";

const props = defineProps<{
    open: boolean;
    availableMonths: AvailableMonth[];
}>();

const emit = defineEmits<{
    "update:open": [value: boolean];
    renew: [budget: Budget];
}>();

const {t, locale} = useI18n();
const budgetStore = useBudgetStore();

const selectedPeriod = ref<string>("");
const isLoading = ref(false);

const monthFormatter = computed(() => {
    return new Intl.DateTimeFormat(locale.value ?? "en-US", {month: "long"});
});

const formattedMonths = computed(() => {
    return props.availableMonths.map((m) => ({
        ...m,
        label: `${monthFormatter.value.format(new Date(m.year, m.month - 1, 1))} ${m.year}`,
        value: `${m.year}-${m.month}`,
    }));
});

watch(
    () => props.open,
    (open) => {
        if (open) {
            selectedPeriod.value = "";
        }
    },
);

async function handleRenew() {
    if (!selectedPeriod.value) return;
    const [yearStr, monthStr] = selectedPeriod.value.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    isLoading.value = true;
    try {
        const budget = await budgetStore.getBudgetByPeriod(year, month);
        if (budget) {
            emit("renew", budget);
            emit("update:open", false);
        }
    } catch {
        // Error already handled by store
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
                    <Select v-model="selectedPeriod">
                        <SelectTrigger>
                            <SelectValue :placeholder="t('budget.renewDialog.selectPlaceholder')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-if="formattedMonths.length === 0" value="__none__" disabled>
                                {{ t("budget.page.noPreviousBudget") }}
                            </SelectItem>
                            <SelectItem v-for="m in formattedMonths" :key="m.value" :value="m.value">
                                {{ m.label }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="emit('update:open', false)">{{ t("common.cancel") }}</Button>
                <Button :disabled="!selectedPeriod || isLoading" @click="handleRenew">
                    {{ t("budget.renewDialog.continue") }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
