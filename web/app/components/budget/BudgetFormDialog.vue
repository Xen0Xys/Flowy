<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import type {BudgetedCategory, BudgetSpendingCategory} from "~/stores/budget.store";
import {useReferenceStore} from "~/stores/reference.store";
import {Button} from "~/components/ui/button";
import {Input} from "~/components/ui/input";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {ScrollArea} from "~/components/ui/scroll-area";
import {Label} from "~/components/ui/label";
import {Separator} from "~/components/ui/separator";

const props = defineProps<{
    open: boolean;
    mode: "create" | "edit" | "renew";
    budgetId?: string;
    targetMonth: number;
    targetYear: number;
    existingBudget?: {
        month: number;
        year: number;
        budgetedIncome: number;
        categories: BudgetedCategory[];
    } | null;
    spendingCategories?: BudgetSpendingCategory[];
}>();

const emit = defineEmits<{
    "update:open": [value: boolean];
    save: [
        payload: {
            month: number;
            year: number;
            budgetedIncome: number;
            categories: {categoryId: string; amount: number}[];
        },
    ];
}>();

const {t} = useI18n();
const referenceStore = useReferenceStore();

const budgetedIncome = ref(0);
const categoryAmounts = ref<Record<string, number>>({});

const dialogTitle = computed(() => {
    switch (props.mode) {
        case "create":
            return t("budget.dialog.createTitle");
        case "edit":
            return t("budget.dialog.editTitle");
        case "renew":
            return t("budget.dialog.renewTitle");
        default:
            return "";
    }
});

const dialogDescription = computed(() => {
    switch (props.mode) {
        case "create":
            return t("budget.dialog.createDescription");
        case "edit":
            return t("budget.dialog.editDescription");
        case "renew":
            return t("budget.dialog.renewDescription");
        default:
            return "";
    }
});

const totalCategoryBudget = computed(() => {
    return Object.values(categoryAmounts.value).reduce((sum, v) => sum + v, 0);
});

const hasAtLeastOneCategory = computed(() => {
    return Object.values(categoryAmounts.value).some((v) => v >= 0.01);
});

const canSave = computed(() => {
    if (budgetedIncome.value < 0.01) {
        return false;
    }

    if (props.mode === "edit") {
        return true;
    }

    return hasAtLeastOneCategory.value;
});

const availableCategories = computed(() => {
    const all = [...referenceStore.categories];
    if (props.spendingCategories) {
        for (const sc of props.spendingCategories) {
            if (sc.categoryId && !all.find((c) => c.id === sc.categoryId)) {
                all.push({
                    id: sc.categoryId,
                    name: sc.name,
                    hexColor: sc.hexColor,
                    icon: sc.icon,
                    userId: "",
                    createdAt: "",
                    updatedAt: "",
                });
            }
        }
    }
    return all;
});

watch(
    () => props.open,
    (open) => {
        if (open) {
            if (props.existingBudget) {
                budgetedIncome.value = props.existingBudget.budgetedIncome;
                categoryAmounts.value = {};
                for (const cat of props.existingBudget.categories) {
                    categoryAmounts.value[cat.categoryId] = cat.amount;
                }
            } else {
                budgetedIncome.value = 0;
                categoryAmounts.value = {};
            }
        }
    },
);

function handleSave() {
    const categories = Object.entries(categoryAmounts.value)
        .filter(([, amount]) => amount >= 0.01)
        .map(([categoryId, amount]) => ({categoryId, amount}));

    if (props.mode !== "edit" && categories.length === 0) return;

    emit("save", {
        month: props.targetMonth,
        year: props.targetYear,
        budgetedIncome: budgetedIncome.value,
        categories,
    });
}

function setCategoryAmount(categoryId: string, amount: number) {
    if (amount < 0.01) {
        delete categoryAmounts.value[categoryId];
    } else {
        categoryAmounts.value[categoryId] = amount;
    }
}
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent class="sm:max-w-[500px]">
            <DialogHeader>
                <DialogTitle>{{ dialogTitle }}</DialogTitle>
                <DialogDescription>{{ dialogDescription }}</DialogDescription>
            </DialogHeader>

            <div class="grid gap-4 py-2">
                <!-- Budgeted Income -->
                <div class="grid gap-2">
                    <Label for="budgetedIncome">{{ t("budget.dialog.budgetedIncome") }}</Label>
                    <Input
                        id="budgetedIncome"
                        v-model.number="budgetedIncome"
                        type="number"
                        min="0.01"
                        step="0.01"
                        :placeholder="t('budget.dialog.budgetedIncomePlaceholder')" />
                </div>

                <Separator />

                <!-- Categories -->
                <div class="grid gap-3">
                    <Label>{{ t("budget.dialog.categories") }}</Label>
                    <ScrollArea class="h-60 pr-2">
                        <div class="space-y-2">
                            <div
                                v-for="category in availableCategories"
                                :key="category.id"
                                class="flex items-center gap-3">
                                <div
                                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                                    :style="{backgroundColor: category.hexColor + '20', color: category.hexColor}">
                                    <Icon :name="category.icon" class="h-4 w-4" />
                                </div>
                                <span class="flex-1 truncate text-sm">{{ category.name }}</span>
                                <Input
                                    :model-value="categoryAmounts[category.id] ?? ''"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    class="w-24"
                                    :placeholder="t('budget.dialog.amountPlaceholder')"
                                    @update:model-value="setCategoryAmount(category.id, Number($event))" />
                            </div>
                        </div>
                    </ScrollArea>
                </div>

                <!-- Summary -->
                <div class="flex items-center justify-between text-sm">
                    <span class="text-muted-foreground">{{ t("budget.dialog.totalCategories") }}</span>
                    <span class="font-medium tabular-nums">{{ totalCategoryBudget.toFixed(2) }}</span>
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="emit('update:open', false)">{{ t("common.cancel") }}</Button>
                <Button :disabled="!canSave" @click="handleSave">
                    {{ t("common.save") }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
