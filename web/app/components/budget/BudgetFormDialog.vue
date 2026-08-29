<script lang="ts" setup>
import {useMediaQuery} from "@vueuse/core";
import {computed, nextTick, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import type {BudgetedCategory, BudgetSpendingCategory} from "~/stores/budget.store";
import {useReferenceStore} from "~/stores/reference.store";
import type {TransactionCategory} from "~/stores/transaction.store";
import MoneyInput from "~/components/common/MoneyInput.vue";
import {Alert, AlertDescription} from "~/components/ui/alert";
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
import {Button} from "~/components/ui/button";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "~/components/ui/command";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Label} from "~/components/ui/label";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {ScrollArea} from "~/components/ui/scroll-area";
import {Separator} from "~/components/ui/separator";
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from "~/components/ui/sheet";
import {toCurrency} from "~/lib/currency";

type CategoryLike = Pick<TransactionCategory, "id" | "name" | "hexColor" | "icon">;

const props = withDefaults(
    defineProps<{
        open: boolean;
        mode: "create" | "edit" | "renew";
        currency: string;
        budgetId?: string;
        targetMonth: number;
        targetYear: number;
        targetPeriodLabel?: string;
        sourcePeriodLabel?: string;
        isSaving?: boolean;
        existingBudget?: {
            month: number;
            year: number;
            budgetedIncome: number;
            categories: BudgetedCategory[];
        } | null;
        spendingCategories?: BudgetSpendingCategory[];
    }>(),
    {
        isSaving: false,
    },
);

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

const isMobile = useMediaQuery("(max-width: 768px)");

const budgetedIncome = ref(0);
const categoryAmounts = ref<Record<string, number>>({});
const selectedCategoryIds = ref<Set<string>>(new Set());
const renewedCategoryIds = ref<Set<string>>(new Set());
const isPickerOpen = ref(false);
const isDiscardConfirmOpen = ref(false);
const initialSnapshot = ref<string>("");
const hasStartedFresh = ref(false);

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

const saveButtonLabel = computed(() => {
    switch (props.mode) {
        case "edit":
            return t("budget.dialog.updateButton");
        case "renew":
            return t("budget.dialog.renewButton");
        default:
            return t("budget.dialog.createButton");
    }
});

const availableCategories = computed<CategoryLike[]>(() => {
    const map = new Map<string, CategoryLike>();
    for (const c of referenceStore.categories) {
        map.set(c.id, {id: c.id, name: c.name, hexColor: c.hexColor, icon: c.icon});
    }
    if (props.spendingCategories) {
        for (const sc of props.spendingCategories) {
            if (sc.categoryId && !map.has(sc.categoryId)) {
                map.set(sc.categoryId, {
                    id: sc.categoryId,
                    name: sc.name,
                    hexColor: sc.hexColor,
                    icon: sc.icon,
                });
            }
        }
    }
    return [...map.values()];
});

const categoryById = computed(() => new Map(availableCategories.value.map((c) => [c.id, c])));

const selectedCategoryRows = computed(() => {
    const rows: Array<{category: CategoryLike; amount: number; isRenewed: boolean}> = [];
    for (const id of selectedCategoryIds.value) {
        const category = categoryById.value.get(id);
        if (!category) continue;
        rows.push({
            category,
            amount: categoryAmounts.value[id] ?? 0,
            isRenewed: renewedCategoryIds.value.has(id),
        });
    }
    return rows.sort((a, b) => a.category.name.localeCompare(b.category.name));
});

const pickerCategories = computed(() => {
    return availableCategories.value
        .filter((c) => !selectedCategoryIds.value.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name));
});

const totalAllocated = computed(() => {
    let total = 0;
    for (const id of selectedCategoryIds.value) {
        total += categoryAmounts.value[id] ?? 0;
    }
    return total;
});

const remaining = computed(() => budgetedIncome.value - totalAllocated.value);

const isOverAllocated = computed(() => remaining.value < -0.005);
const isBalanced = computed(
    () => budgetedIncome.value > 0 && Math.abs(remaining.value) <= 0.005 && totalAllocated.value > 0,
);

const allocationPercentage = computed(() => {
    if (budgetedIncome.value <= 0) return 0;
    return Math.min(100, Math.round((totalAllocated.value / budgetedIncome.value) * 100));
});

const allocationBarClass = computed(() => {
    if (isOverAllocated.value) return "bg-destructive";
    if (isBalanced.value) return "bg-primary";
    return "bg-success";
});

const allocationTextClass = computed(() => {
    if (isOverAllocated.value) return "text-destructive";
    return "text-foreground";
});

const formattedIncome = computed(() => toCurrency(budgetedIncome.value, props.currency));
const formattedAllocated = computed(() => toCurrency(totalAllocated.value, props.currency));
const formattedRemaining = computed(() => toCurrency(Math.max(0, remaining.value), props.currency));
const formattedOverAmount = computed(() => toCurrency(Math.max(0, -remaining.value), props.currency));

const hasAtLeastOneCategory = computed(() => {
    for (const id of selectedCategoryIds.value) {
        if ((categoryAmounts.value[id] ?? 0) >= 0.01) return true;
    }
    return false;
});

const canSave = computed(() => {
    if (budgetedIncome.value < 0.01) return false;
    if (props.mode === "edit") return true;
    return hasAtLeastOneCategory.value;
});

const disabledReason = computed(() => {
    if (budgetedIncome.value < 0.01) return t("budget.dialog.needIncomeHint");
    if (props.mode !== "edit" && !hasAtLeastOneCategory.value) return t("budget.dialog.needCategoryHint");
    return "";
});

function captureSnapshot() {
    initialSnapshot.value = JSON.stringify({
        income: budgetedIncome.value,
        amounts: Object.fromEntries([...selectedCategoryIds.value].map((id) => [id, categoryAmounts.value[id] ?? 0])),
    });
}

const isDirty = computed(() => {
    if (!props.open) return false;
    const current = JSON.stringify({
        income: budgetedIncome.value,
        amounts: Object.fromEntries([...selectedCategoryIds.value].map((id) => [id, categoryAmounts.value[id] ?? 0])),
    });
    return current !== initialSnapshot.value;
});

function loadFromExisting() {
    if (props.existingBudget) {
        budgetedIncome.value = props.existingBudget.budgetedIncome;
        categoryAmounts.value = {};
        selectedCategoryIds.value = new Set();
        renewedCategoryIds.value = new Set();
        for (const cat of props.existingBudget.categories) {
            categoryAmounts.value[cat.categoryId] = cat.amount;
            selectedCategoryIds.value.add(cat.categoryId);
            if (props.mode === "renew") {
                renewedCategoryIds.value.add(cat.categoryId);
            }
        }
    } else {
        budgetedIncome.value = 0;
        categoryAmounts.value = {};
        selectedCategoryIds.value = new Set();
        renewedCategoryIds.value = new Set();
    }
}

watch(
    () => props.open,
    (open) => {
        if (open) {
            hasStartedFresh.value = false;
            loadFromExisting();
            nextTick(() => captureSnapshot());
        }
    },
    {immediate: true},
);

function handleSave() {
    const categories = [...selectedCategoryIds.value]
        .map((id) => ({categoryId: id, amount: categoryAmounts.value[id] ?? 0}))
        .filter((c) => c.amount >= 0.01);

    if (props.mode !== "edit" && categories.length === 0) return;

    emit("save", {
        month: props.targetMonth,
        year: props.targetYear,
        budgetedIncome: budgetedIncome.value,
        categories,
    });
}

function requestClose() {
    if (isDirty.value) {
        isDiscardConfirmOpen.value = true;
        return;
    }
    emit("update:open", false);
}

function handleOpenChange(value: boolean) {
    if (!value && isDirty.value) {
        isDiscardConfirmOpen.value = true;
        return;
    }
    emit("update:open", value);
}

function confirmDiscard() {
    isDiscardConfirmOpen.value = false;
    emit("update:open", false);
}

function setCategoryAmount(categoryId: string, amount: number) {
    categoryAmounts.value = {...categoryAmounts.value, [categoryId]: amount};
}

function addCategory(categoryId: string) {
    selectedCategoryIds.value = new Set([...selectedCategoryIds.value, categoryId]);
    if (categoryAmounts.value[categoryId] === undefined) {
        categoryAmounts.value = {...categoryAmounts.value, [categoryId]: 0};
    }
    isPickerOpen.value = false;
}

function removeCategory(categoryId: string) {
    const next = new Set(selectedCategoryIds.value);
    next.delete(categoryId);
    selectedCategoryIds.value = next;
    const nextAmounts = {...categoryAmounts.value};
    delete nextAmounts[categoryId];
    categoryAmounts.value = nextAmounts;
    renewedCategoryIds.value.delete(categoryId);
}

function startFromScratch() {
    budgetedIncome.value = 0;
    categoryAmounts.value = {};
    selectedCategoryIds.value = new Set();
    renewedCategoryIds.value = new Set();
    hasStartedFresh.value = true;
}
</script>

<template>
    <component :is="isMobile ? Sheet : Dialog" :open="open" @update:open="handleOpenChange">
        <component
            :is="isMobile ? SheetContent : DialogContent"
            :side="isMobile ? 'bottom' : undefined"
            :class="
                isMobile
                    ? 'grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-t-2xl p-0'
                    : 'grid max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[560px]'
            ">
            <component
                :is="isMobile ? SheetHeader : DialogHeader"
                class="border-border/60 shrink-0 border-b px-6 pt-6 pb-4 text-left">
                <component :is="isMobile ? SheetTitle : DialogTitle">{{ dialogTitle }}</component>
                <component :is="isMobile ? SheetDescription : DialogDescription">
                    {{ dialogDescription }}
                </component>
                <div
                    v-if="targetPeriodLabel"
                    class="text-muted-foreground mt-2 inline-flex items-center gap-1.5 text-xs">
                    <Icon class="size-3.5" name="iconoir:calendar" />
                    <span>{{ t("budget.dialog.targetPeriodLabel", {period: targetPeriodLabel}) }}</span>
                </div>
            </component>

            <div class="flex min-h-0 flex-1 flex-col gap-5 px-6 py-5">
                <!-- Renew banner -->
                <Alert
                    v-if="mode === 'renew' && sourcePeriodLabel && !hasStartedFresh"
                    class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
                    <Icon name="iconoir:data-transfer-both" />
                    <AlertDescription class="flex-1">
                        {{ t("budget.dialog.sourceHint", {period: sourcePeriodLabel}) }}
                    </AlertDescription>
                    <Button class="shrink-0" size="sm" type="button" variant="ghost" @click="startFromScratch">
                        {{ t("budget.dialog.resetSource") }}
                    </Button>
                </Alert>

                <!-- Hero income -->
                <div class="flex shrink-0 flex-col gap-2">
                    <Label class="text-sm font-medium" for="budgetedIncome">
                        {{ t("budget.dialog.budgetedIncome") }}
                    </Label>
                    <MoneyInput
                        id="budgetedIncome"
                        v-model="budgetedIncome"
                        :currency="currency"
                        :placeholder="t('budget.dialog.budgetedIncomePlaceholder')"
                        size="lg"
                        variant="income" />
                </div>

                <!-- Allocation feedback -->
                <div
                    :aria-valuemax="100"
                    :aria-valuemin="0"
                    :aria-valuenow="allocationPercentage"
                    class="flex shrink-0 flex-col gap-1.5"
                    role="progressbar">
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-muted-foreground">{{ t("budget.dialog.allocated") }}</span>
                        <span :class="['font-medium tabular-nums', allocationTextClass]">
                            {{ formattedAllocated }} / {{ formattedIncome }}
                        </span>
                    </div>
                    <div class="bg-muted h-2 w-full overflow-hidden rounded-full">
                        <div
                            :class="['h-full transition-all duration-300', allocationBarClass]"
                            :style="{width: allocationPercentage + '%'}"></div>
                    </div>
                    <div class="flex items-center justify-between text-xs">
                        <span v-if="isBalanced" class="text-primary inline-flex items-center gap-1 font-medium">
                            <Icon class="size-3.5" name="iconoir:check-circle" />
                            {{ t("budget.dialog.balanced") }}
                        </span>
                        <span
                            v-else-if="isOverAllocated"
                            class="text-destructive inline-flex items-center gap-1 font-medium">
                            <Icon class="size-3.5" name="iconoir:warning-triangle" />
                            {{ t("budget.dialog.overAllocatedBy", {amount: formattedOverAmount}) }}
                        </span>
                        <span v-else class="text-muted-foreground">
                            {{ t("budget.dialog.remaining", {amount: formattedRemaining}) }}
                        </span>
                    </div>
                </div>

                <Separator class="shrink-0" />

                <!-- Categories -->
                <div class="flex min-h-0 flex-1 flex-col gap-3">
                    <div class="flex shrink-0 items-center justify-between gap-2">
                        <Label class="text-sm font-medium">{{ t("budget.dialog.categories") }}</Label>
                        <Popover v-model:open="isPickerOpen">
                            <PopoverTrigger as-child>
                                <Button
                                    :disabled="pickerCategories.length === 0"
                                    size="sm"
                                    type="button"
                                    variant="outline">
                                    <Icon name="iconoir:plus" />
                                    {{ t("budget.dialog.addCategory") }}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent :class="isMobile ? 'w-[calc(100vw-3rem)] p-0' : 'w-72 p-0'" align="end">
                                <Command>
                                    <CommandInput :placeholder="t('budget.dialog.searchCategoryPlaceholder')" />
                                    <CommandList>
                                        <CommandEmpty>{{ t("budget.dialog.noCategoriesFound") }}</CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem
                                                v-for="cat in pickerCategories"
                                                :key="cat.id"
                                                :value="cat.name"
                                                class="gap-2"
                                                @select="addCategory(cat.id)">
                                                <div
                                                    :style="{
                                                        backgroundColor: cat.hexColor + '20',
                                                        color: cat.hexColor,
                                                    }"
                                                    class="flex size-6 shrink-0 items-center justify-center rounded-md">
                                                    <Icon :name="cat.icon" class="size-3.5" />
                                                </div>
                                                <span class="truncate">{{ cat.name }}</span>
                                            </CommandItem>
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div
                        v-if="selectedCategoryRows.length === 0"
                        class="border-border/60 text-muted-foreground shrink-0 rounded-md border border-dashed py-6 text-center text-sm">
                        {{ t("budget.dialog.noCategoriesHint") }}
                    </div>

                    <ScrollArea v-else class="min-h-0 flex-1 overflow-hidden pr-2">
                        <div class="flex flex-col gap-1.5">
                            <div
                                v-for="row in selectedCategoryRows"
                                :key="row.category.id"
                                class="hover:bg-muted/40 group flex items-center gap-2 rounded-md p-1 transition-colors">
                                <div
                                    :style="{
                                        backgroundColor: row.category.hexColor + '20',
                                        color: row.category.hexColor,
                                    }"
                                    class="flex size-8 shrink-0 items-center justify-center rounded-md">
                                    <Icon :name="row.category.icon" class="size-4" />
                                </div>
                                <label
                                    :for="'budget-cat-' + row.category.id"
                                    class="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm">
                                    <span class="truncate">{{ row.category.name }}</span>
                                    <span
                                        v-if="row.isRenewed && mode === 'renew'"
                                        class="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                                        {{ t("budget.dialog.renewedBadge") }}
                                    </span>
                                </label>
                                <MoneyInput
                                    :id="'budget-cat-' + row.category.id"
                                    :currency="currency"
                                    :model-value="row.amount"
                                    class="w-28 sm:w-32"
                                    size="sm"
                                    @update:model-value="setCategoryAmount(row.category.id, $event)" />
                                <Button
                                    :aria-label="t('budget.dialog.removeCategory')"
                                    size="icon-sm"
                                    type="button"
                                    variant="ghost"
                                    @click="removeCategory(row.category.id)">
                                    <Icon name="iconoir:xmark" />
                                </Button>
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            </div>

            <!-- Footer -->
            <div
                class="border-border/60 bg-background flex shrink-0 flex-col-reverse gap-2 border-t px-6 pt-3 pb-4 sm:flex-row sm:items-center sm:justify-between"
                style="padding-bottom: max(1rem, env(safe-area-inset-bottom))">
                <p v-if="!canSave && disabledReason" class="text-muted-foreground text-xs sm:mr-4">
                    {{ disabledReason }}
                </p>
                <div v-else class="hidden sm:block"></div>
                <div class="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
                    <Button class="w-full sm:w-auto" type="button" variant="outline" @click="requestClose">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="!canSave || isSaving" class="w-full sm:w-auto" type="button" @click="handleSave">
                        <Icon v-if="isSaving" class="animate-spin" name="iconoir:refresh-double" />
                        {{ saveButtonLabel }}
                    </Button>
                </div>
            </div>
        </component>
    </component>

    <!-- Discard confirmation -->
    <AlertDialog v-model:open="isDiscardConfirmOpen">
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{{ t("budget.dialog.discardChangesTitle") }}</AlertDialogTitle>
                <AlertDialogDescription>
                    {{ t("budget.dialog.discardChangesDescription") }}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                <AlertDialogAction
                    class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    @click="confirmDiscard">
                    {{ t("budget.dialog.discardChangesConfirm") }}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
</template>
