<script lang="ts" setup>
import {getLocalTimeZone, today} from "@internationalized/date";
import type {DateValue} from "reka-ui";
import {computed, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useFamilyStore} from "~/stores/family.store";
import {type AvailableMonth, type Budget, type BudgetSpending, useBudgetStore} from "~/stores/budget.store";
import {useReferenceStore} from "~/stores/reference.store";
import BudgetDonutChart from "~/components/budget/BudgetDonutChart.vue";
import BudgetCategoryRow from "~/components/budget/BudgetCategoryRow.vue";
import BudgetFormDialog from "~/components/budget/BudgetFormDialog.vue";
import BudgetRenewDialog from "~/components/budget/BudgetRenewDialog.vue";
import {Button} from "~/components/ui/button";
import {Calendar} from "~/components/ui/calendar";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {Skeleton} from "~/components/ui/skeleton";
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

const {t, locale} = useI18n();
const budgetStore = useBudgetStore();
const referenceStore = useReferenceStore();
const familyStore = useFamilyStore();

const now = new Date();
const selectedMonth = ref(now.getMonth() + 1);
const selectedYear = ref(now.getFullYear());

const budget = ref<Budget | null>(null);
const spending = ref<BudgetSpending | null>(null);
const availableMonths = ref<AvailableMonth[]>([]);
const isLoading = ref(true);
const latestLoadRequestId = ref(0);

// Dialog states
const isCreateDialogOpen = ref(false);
const isEditDialogOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const isRenewDialogOpen = ref(false);
const dialogMode = ref<"create" | "edit" | "renew">("create");
const renewSourceBudget = ref<Budget | null>(null);
const isPeriodPickerOpen = ref(false);
const draftPeriodDate = ref<DateValue>();
const draftPeriodPlaceholder = ref<DateValue>();

const currency = computed(() => familyStore.family?.currency ?? "USD");

const budgetExists = computed(() => !!budget.value);

const donutSegments = computed(() => {
    // Product decision: when no budget exists for the selected period,
    // keep the donut empty instead of showing spending-only breakdown.
    if (!budget.value) {
        return [];
    }

    const segments: Array<{
        label: string;
        value: number;
        color: string;
        icon?: string;
        budgeted: number;
        spent: number;
    }> = [];

    // Show spending categories when a budget exists
    if (budget.value.budgetedCategories?.length) {
        const spendingMap = new Map((spending.value?.byCategory ?? []).map((cat) => [cat.categoryId, cat]));
        for (const bc of budget.value.budgetedCategories) {
            if (!bc.categoryId) continue;
            const spendingCat = spendingMap.get(bc.categoryId!);
            const refCat = referenceStore.categories.find((c) => c.id === bc.categoryId);
            const spent = spendingCat?.spent ?? 0;
            if (spent <= 0.005) continue;
            segments.push({
                label: spendingCat?.name ?? refCat?.name ?? "Unknown",
                value: spent,
                color: spendingCat?.hexColor ?? refCat?.hexColor ?? "#888",
                icon: spendingCat?.icon ?? refCat?.icon,
                budgeted: bc.amount,
                spent,
            });
        }

        // Add uncategorized spending as "Uncategorized" segment
        const uncategorizedSpent =
            spending.value?.byCategory?.filter((cat) => !cat.categoryId).reduce((sum, cat) => sum + cat.spent, 0) ?? 0;
        if (uncategorizedSpent > 0.005) {
            segments.push({
                label: t("budget.category.uncategorized"),
                value: uncategorizedSpent,
                color: "#888",
                budgeted: 0,
                spent: uncategorizedSpent,
            });
        }
    }
    return segments;
});

const donutTotalSpent = computed(() => {
    return spending.value?.totalSpent ?? 0;
});

const donutActualIncome = computed(() => {
    return spending.value?.actualIncome ?? 0;
});

const categoryRows = computed(() => {
    // Product decision: when no budget exists, hide the category list entirely
    // (no spending-only rows in the right panel for that state).
    if (!budget.value) {
        return [];
    }

    const rows: Array<{
        id: string;
        name: string;
        icon: string;
        hexColor: string;
        spent: number;
        budgeted: number;
    }> = [];
    const spendingMap = new Map((spending.value?.byCategory ?? []).map((cat) => [cat.categoryId, cat]));

    // Collect all budgeted categories
    const budgetedCategories: Array<{
        id: string;
        name: string;
        icon: string;
        hexColor: string;
        spent: number;
        budgeted: number;
    }> = [];
    if (budget.value?.budgetedCategories) {
        for (const bc of budget.value.budgetedCategories) {
            if (!bc.categoryId) continue;
            const spendingCat = spendingMap.get(bc.categoryId);
            const refCat = referenceStore.categories.find((c) => c.id === bc.categoryId);
            budgetedCategories.push({
                id: bc.categoryId,
                name: spendingCat?.name ?? refCat?.name ?? "Unknown",
                icon: spendingCat?.icon ?? refCat?.icon ?? "iconoir:question-mark",
                hexColor: spendingCat?.hexColor ?? refCat?.hexColor ?? "#888",
                spent: spendingCat?.spent ?? 0,
                budgeted: bc.amount,
            });
        }
    }

    // Collect spending-only categories
    const spendingOnlyCategories: Array<{
        id: string;
        name: string;
        icon: string;
        hexColor: string;
        spent: number;
        budgeted: number;
    }> = [];
    if (spending.value?.byCategory) {
        const budgetedCategoryIds = new Set(budget.value?.budgetedCategories?.map((bc) => bc.categoryId) ?? []);
        for (const cat of spending.value.byCategory) {
            if (!cat.categoryId) continue;
            if (budget.value && budgetedCategoryIds.has(cat.categoryId)) continue;
            spendingOnlyCategories.push({
                id: cat.categoryId ?? `spending-${cat.name}`,
                name: cat.name,
                icon: cat.icon,
                hexColor: cat.hexColor,
                spent: cat.spent,
                budgeted: 0,
            });
        }
    }

    // Sort both groups alphabetically by name (locale-aware)
    const collator = new Intl.Collator(locale.value ?? "en-US", {sensitivity: "base"});
    budgetedCategories.sort((a, b) => collator.compare(a.name, b.name));
    spendingOnlyCategories.sort((a, b) => collator.compare(a.name, b.name));

    // Merge: budgeted first, then spending-only
    rows.push(...budgetedCategories, ...spendingOnlyCategories);

    // Add "Uncategorized" row at the end with unallocated budget amount + uncategorized spending
    const totalBudgeted = budget.value?.budgetedCategories?.reduce((sum, bc) => sum + bc.amount, 0) ?? 0;
    const unallocated = budget.value ? budget.value.budgetedIncome - totalBudgeted : 0;
    const uncategorizedSpent =
        spending.value?.byCategory?.filter((cat) => !cat.categoryId).reduce((sum, cat) => sum + cat.spent, 0) ?? 0;
    if (unallocated > 0.005 || uncategorizedSpent > 0.005) {
        rows.push({
            id: "__uncategorized__",
            name: t("budget.category.uncategorized"),
            icon: "iconoir:question-mark",
            hexColor: "#888",
            spent: uncategorizedSpent,
            budgeted: unallocated,
        });
    }

    return rows;
});

const monthOptions = computed(() => {
    return [
        {value: 1, label: t("budget.page.months.january")},
        {value: 2, label: t("budget.page.months.february")},
        {value: 3, label: t("budget.page.months.march")},
        {value: 4, label: t("budget.page.months.april")},
        {value: 5, label: t("budget.page.months.may")},
        {value: 6, label: t("budget.page.months.june")},
        {value: 7, label: t("budget.page.months.july")},
        {value: 8, label: t("budget.page.months.august")},
        {value: 9, label: t("budget.page.months.september")},
        {value: 10, label: t("budget.page.months.october")},
        {value: 11, label: t("budget.page.months.november")},
        {value: 12, label: t("budget.page.months.december")},
    ];
});

const availableYears = computed(() => {
    const years = new Set<number>([selectedYear.value, now.getFullYear()]);
    for (const month of availableMonths.value) {
        years.add(month.year);
    }

    const sortedYears = [...years].sort((a, b) => a - b);
    const minYear = sortedYears.at(0) ?? now.getFullYear();
    const maxYear = sortedYears.at(-1) ?? now.getFullYear();

    for (let year = minYear - 2; year <= maxYear + 2; year++) {
        years.add(year);
    }

    return [...years].sort((a, b) => a - b);
});

const calendarYearRange = computed<DateValue[]>(() => {
    const seedDate = today(getLocalTimeZone()).set({month: 1, day: 1});
    return availableYears.value.map((year) => seedDate.set({year}));
});

const canApplyPeriod = computed(() => {
    const month = draftPeriodPlaceholder.value?.month;
    const year = draftPeriodPlaceholder.value?.year;
    if (!month || !year) {
        return false;
    }
    return month !== selectedMonth.value || year !== selectedYear.value;
});

const periodLabel = computed(() => {
    const monthLabel = monthOptions.value.find((month) => month.value === selectedMonth.value)?.label ?? "";
    return `${monthLabel} ${selectedYear.value}`;
});

const existingBudgetForDialog = computed(() => {
    if (dialogMode.value === "renew" && renewSourceBudget.value) {
        return {
            month: renewSourceBudget.value.month,
            year: renewSourceBudget.value.year,
            budgetedIncome: renewSourceBudget.value.budgetedIncome,
            categories: renewSourceBudget.value.budgetedCategories ?? [],
        };
    }
    if (budget.value) {
        return {
            month: budget.value.month,
            year: budget.value.year,
            budgetedIncome: budget.value.budgetedIncome,
            categories: budget.value.budgetedCategories ?? [],
        };
    }
    return null;
});

async function loadData() {
    const requestId = ++latestLoadRequestId.value;
    const year = selectedYear.value;
    const month = selectedMonth.value;

    isLoading.value = true;
    try {
        const [loadedBudget, loadedSpending] = await Promise.all([loadBudget(year, month), loadSpending(year, month)]);

        if (requestId !== latestLoadRequestId.value) {
            return;
        }

        budget.value = loadedBudget;
        spending.value = loadedSpending;
    } catch (err) {
        console.error(err);
    } finally {
        if (requestId === latestLoadRequestId.value) {
            isLoading.value = false;
        }
    }
}

async function loadBudget(year: number, month: number) {
    try {
        return await budgetStore.getBudgetByPeriod(year, month);
    } catch {
        return null;
    }
}

async function loadSpending(year: number, month: number) {
    try {
        return await budgetStore.getSpending(year, month);
    } catch {
        return null;
    }
}

async function loadAvailableMonths() {
    try {
        availableMonths.value = await budgetStore.getAvailableMonths();
    } catch {
        availableMonths.value = [];
    }
}

async function navigateMonth(direction: -1 | 1) {
    let m = selectedMonth.value + direction;
    let y = selectedYear.value;
    if (m < 1) {
        m = 12;
        y--;
    } else if (m > 12) {
        m = 1;
        y++;
    }
    selectedMonth.value = m;
    selectedYear.value = y;
}

function handlePeriodPickerOpenChange(open: boolean) {
    isPeriodPickerOpen.value = open;
    if (open) {
        const currentPeriodDate = today(getLocalTimeZone()).set({
            year: selectedYear.value,
            month: selectedMonth.value,
            day: 1,
        });
        draftPeriodDate.value = currentPeriodDate;
        draftPeriodPlaceholder.value = currentPeriodDate;
    }
}

function applySelectedPeriod() {
    if (!draftPeriodPlaceholder.value) {
        return;
    }

    selectedMonth.value = draftPeriodPlaceholder.value.month;
    selectedYear.value = draftPeriodPlaceholder.value.year;
    isPeriodPickerOpen.value = false;
}

function openCreateDialog() {
    dialogMode.value = "create";
    renewSourceBudget.value = null;
    isCreateDialogOpen.value = true;
}

function openEditDialog() {
    dialogMode.value = "edit";
    isEditDialogOpen.value = true;
}

function openRenewDialog() {
    isRenewDialogOpen.value = true;
}

function handleRenewBudget(sourceBudget: Budget) {
    dialogMode.value = "renew";
    renewSourceBudget.value = sourceBudget;
    isCreateDialogOpen.value = true;
}

async function handleSaveBudget(payload: {
    month: number;
    year: number;
    budgetedIncome: number;
    categories: {categoryId: string; amount: number}[];
}) {
    if (dialogMode.value === "edit" && budget.value) {
        await budgetStore.updateBudget(budget.value.id, {
            budgetedIncome: payload.budgetedIncome,
            categories: payload.categories,
        });
        isEditDialogOpen.value = false;
    } else {
        await budgetStore.createBudget({
            month: selectedMonth.value,
            year: selectedYear.value,
            budgetedIncome: payload.budgetedIncome,
            categories: payload.categories,
        });
        isCreateDialogOpen.value = false;
    }
    await loadData();
    await loadAvailableMonths();
}

async function handleDelete() {
    if (budget.value) {
        await budgetStore.deleteBudget(budget.value.id);
        isDeleteDialogOpen.value = false;
        await loadData();
        await loadAvailableMonths();
    }
}

onMounted(async () => {
    await referenceStore.fetchReferences();
    await familyStore.fetchFamily();
    await loadData();
    await loadAvailableMonths();
});

watch([selectedMonth, selectedYear], async () => {
    await loadData();
});
</script>

<template>
    <div class="w-full">
        <div class="mx-auto max-w-7xl">
            <div class="flex flex-col gap-6 md:h-[calc(100dvh-4rem-1.5rem)]">
                <!-- Header -->
                <div class="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div class="flex items-center gap-3">
                        <Icon class="icon-lg text-primary shrink-0" name="iconoir:piggy-bank" />
                        <div>
                            <h1 class="text-2xl font-bold tracking-tight">
                                {{ t("budget.page.title") }}
                            </h1>
                            <p class="text-muted-foreground text-sm">
                                {{ t("budget.page.subtitle") }}
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <template v-if="!budgetExists">
                            <Button variant="outline" @click="openRenewDialog">
                                <Icon class="h-4 w-4" name="iconoir:data-transfer-both" />
                                {{ t("budget.page.renewBudget") }}
                            </Button>
                            <Button @click="openCreateDialog">
                                <Icon class="h-4 w-4" name="iconoir:plus" />
                                {{ t("budget.page.createBudget") }}
                            </Button>
                        </template>
                        <template v-else>
                            <Button variant="outline" @click="openEditDialog">
                                <Icon class="h-4 w-4" name="iconoir:edit-pencil" />
                                {{ t("budget.page.editBudget") }}
                            </Button>
                            <Button
                                class="text-destructive hover:bg-destructive/10"
                                variant="outline"
                                @click="isDeleteDialogOpen = true">
                                <Icon class="h-4 w-4" name="iconoir:trash" />
                                {{ t("budget.page.deleteBudget") }}
                            </Button>
                        </template>
                    </div>
                </div>

                <!-- Loading -->
                <div v-if="isLoading" class="flex flex-col gap-6 md:min-h-0 md:flex-1">
                    <Skeleton class="h-80 w-full shrink-0 md:w-96" />
                    <div class="space-y-3">
                        <Skeleton class="h-16 w-full" />
                        <Skeleton class="h-16 w-full" />
                        <Skeleton class="h-16 w-full" />
                    </div>
                </div>

                <!-- Main content: always visible (nav + donut + categories) -->
                <template v-else>
                    <div class="flex flex-col gap-6 md:min-h-0 md:flex-1 md:flex-row">
                        <!-- Left panel: nav + donut -->
                        <div class="flex shrink-0 flex-col items-center gap-4 md:w-96">
                            <!-- Month navigation (always visible) -->
                            <div class="flex items-center gap-3">
                                <Button size="icon" variant="ghost" @click="navigateMonth(-1)">
                                    <Icon class="h-4 w-4" name="iconoir:nav-arrow-left" />
                                </Button>
                                <Popover :open="isPeriodPickerOpen" @update:open="handlePeriodPickerOpenChange">
                                    <PopoverTrigger as-child>
                                        <Button class="justify-between text-lg font-semibold" variant="ghost">
                                            <span>{{ periodLabel }}</span>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent class="w-80">
                                        <div class="grid gap-3">
                                            <p class="text-sm font-medium">{{ t("budget.page.periodPicker.title") }}</p>
                                            <p class="text-muted-foreground text-xs">
                                                {{ t("budget.page.periodPicker.calendarHint") }}
                                            </p>
                                            <Calendar
                                                v-model="draftPeriodDate"
                                                v-model:placeholder="draftPeriodPlaceholder"
                                                :year-range="calendarYearRange"
                                                class="rounded-md border"
                                                layout="month-and-year" />
                                            <div class="flex justify-end gap-2 pt-1">
                                                <Button variant="outline" @click="isPeriodPickerOpen = false">
                                                    {{ t("common.cancel") }}
                                                </Button>
                                                <Button :disabled="!canApplyPeriod" @click="applySelectedPeriod">
                                                    {{ t("budget.page.periodPicker.apply") }}
                                                </Button>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                <Button size="icon" variant="ghost" @click="navigateMonth(1)">
                                    <Icon class="h-4 w-4" name="iconoir:nav-arrow-right" />
                                </Button>
                            </div>

                            <!-- Donut chart (always visible, shows spending even without budget) -->
                            <BudgetDonutChart
                                :actual-income="donutActualIncome"
                                :currency="currency"
                                :has-budget="budgetExists"
                                :segments="donutSegments"
                                :total-budgeted="budget?.budgetedIncome ?? 0"
                                :total-spent="donutTotalSpent" />
                        </div>

                        <!-- Right panel: Category list -->
                        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto pr-2">
                            <div v-if="categoryRows.length > 0" class="space-y-2">
                                <BudgetCategoryRow
                                    v-for="cat in categoryRows"
                                    :id="cat.id"
                                    :key="cat.id"
                                    :budgeted="cat.budgeted"
                                    :currency="currency"
                                    :hex-color="cat.hexColor"
                                    :icon="cat.icon"
                                    :name="cat.name"
                                    :spent="cat.spent" />
                            </div>
                            <div v-else class="flex flex-1 items-center justify-center text-center">
                                <div>
                                    <Icon class="text-muted-foreground mb-2 h-8 w-8" name="iconoir:journal-page" />
                                    <p class="text-muted-foreground text-sm">
                                        {{ t("budget.page.noSpending") }}
                                    </p>
                                    <p class="text-muted-foreground mt-1 text-xs">
                                        {{ t("budget.page.noSpendingDescription") }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <!-- Renew Dialog -->
        <BudgetRenewDialog
            v-model:open="isRenewDialogOpen"
            :available-months="availableMonths"
            @renew="handleRenewBudget" />

        <!-- Create / Renew Dialog -->
        <BudgetFormDialog
            v-model:open="isCreateDialogOpen"
            :existing-budget="existingBudgetForDialog"
            :mode="dialogMode"
            :spending-categories="spending?.byCategory"
            :target-month="selectedMonth"
            :target-year="selectedYear"
            @save="handleSaveBudget" />

        <!-- Edit Dialog -->
        <BudgetFormDialog
            v-if="budget"
            v-model:open="isEditDialogOpen"
            :budget-id="budget.id"
            :existing-budget="{
                month: budget.month,
                year: budget.year,
                budgetedIncome: budget.budgetedIncome,
                categories: budget.budgetedCategories ?? [],
            }"
            :mode="'edit'"
            :spending-categories="spending?.byCategory"
            :target-month="budget.month"
            :target-year="budget.year"
            @save="handleSaveBudget" />

        <!-- Delete Confirmation -->
        <AlertDialog :open="isDeleteDialogOpen" @update:open="isDeleteDialogOpen = $event">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{{ t("common.areYouSure") }}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {{ t("budget.dialog.deleteDescription") }}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                    <AlertDialogAction
                        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        @click="handleDelete">
                        {{ t("common.delete") }}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
</template>
