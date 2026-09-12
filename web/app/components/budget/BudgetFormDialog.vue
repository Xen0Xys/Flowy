<script lang="ts" setup>
import {useMediaQuery} from "@vueuse/core";
import {computed, nextTick, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {type BudgetedCategory, type BudgetSpendingCategory, useBudgetStore} from "~/stores/budget.store";
import type {Account} from "~/stores/account.store";
import {useReferenceStore} from "~/stores/reference.store";
import type {TransactionCategory} from "~/stores/reference.store";
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
import {Switch} from "~/components/ui/switch";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "~/components/ui/command";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Input} from "~/components/ui/input";
import {Label} from "~/components/ui/label";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {ScrollArea} from "~/components/ui/scroll-area";
import {Separator} from "~/components/ui/separator";
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from "~/components/ui/sheet";
import {toCurrency} from "~/lib/currency";
import AccountSharedBadge from "~/components/accounts/AccountSharedBadge.vue";

type CategoryLike = Pick<TransactionCategory, "id" | "name" | "hexColor" | "icon">;
type OwnerGroup = {ownerId: string; ownerLabel: string; accounts: Account[]};

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
            name?: string | null;
            budgetedIncome: number;
            categories: BudgetedCategory[];
            accountIds?: string[];
        } | null;
        spendingCategories?: BudgetSpendingCategory[];
        plannedCategories?: BudgetSpendingCategory[];
        // Accounts the user can put in a budget (min WRITE access), grouped by owner.
        accountGroups: OwnerGroup[];
        // Whether the sharee (non-owner) is editing: locks the account picker.
        lockAccounts?: boolean;
    }>(),
    {
        isSaving: false,
        lockAccounts: false,
    },
);

const emit = defineEmits<{
    "update:open": [value: boolean];
    save: [
        payload: {
            name: string | null;
            month: number;
            year: number;
            budgetedIncome: number;
            categories: {categoryId: string; amount: number}[];
            accountIds: string[];
        },
    ];
}>();

const {t} = useI18n();
const referenceStore = useReferenceStore();
const budgetStore = useBudgetStore();

const isMobile = useMediaQuery("(max-width: 768px)");

const budgetName = ref<string>("");
const budgetedIncome = ref(0);
const categoryAmounts = ref<Record<string, number>>({});
const selectedCategoryIds = ref<Set<string>>(new Set());
const selectedAccountIds = ref<Set<string>>(new Set());
const renewedCategoryIds = ref<Set<string>>(new Set());
const plannedCategoryIds = ref<Set<string>>(new Set());
const isPickerOpen = ref(false);
const isDiscardConfirmOpen = ref(false);
const initialSnapshot = ref<string>("");
const hasStartedFresh = ref(false);
const ownerCategories = ref<CategoryLike[]>([]);
const scopedPlannedCategories = ref<BudgetSpendingCategory[]>([]);
const scopeRequestId = ref(0);
const plannedRequestId = ref(0);
// While the dialog is bootstrapping async owner + planned fetches, isDirty
// must stay false: otherwise auto-injected planned categories flip the flag
// without any user input and the discard-confirm modal fires on Cancel.
const isInitializing = ref(false);

const activeOwnerId = computed<string | null>(() => {
    for (const group of props.accountGroups) {
        for (const account of group.accounts) {
            if (selectedAccountIds.value.has(account.id)) return group.ownerId;
        }
    }
    return null;
});

const hasSelectedAccounts = computed(() => selectedAccountIds.value.size > 0);
const hasWritableAccounts = computed(() => props.accountGroups.some((g) => g.accounts.length > 0));

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

const plannedByCategoryId = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    // In create mode the planned list is fetched dynamically for the selected
    // account scope; in edit/renew we still rely on the props from the parent.
    const source = props.mode === "create" ? scopedPlannedCategories.value : props.plannedCategories;
    if (!source) return map;
    for (const pc of source) {
        if (pc.categoryId && (pc.planned ?? 0) > 0) {
            map.set(pc.categoryId, pc.planned);
        }
    }
    return map;
});

const availableCategories = computed<CategoryLike[]>(() => {
    const map = new Map<string, CategoryLike>();
    // Owner-scoped categories fetched from the API drive display; the current
    // user's reference store is only used as a hint when no account (and thus
    // no owner) is selected yet.
    const primary = activeOwnerId.value ? ownerCategories.value : referenceStore.categories;
    for (const c of primary) {
        map.set(c.id, {id: c.id, name: c.name, hexColor: c.hexColor, icon: c.icon});
    }
    // Pre-selected categories on a shared budget belong to the owner and may
    // not be present in the sharee's reference store; seed them so the
    // selected rows display the correct name/icon/color.
    if (props.existingBudget?.categories) {
        for (const bc of props.existingBudget.categories) {
            if (!map.has(bc.categoryId)) {
                map.set(bc.categoryId, {
                    id: bc.categoryId,
                    name: bc.name,
                    hexColor: bc.hexColor,
                    icon: bc.icon,
                });
            }
        }
    }
    const addFromSpending = (list: BudgetSpendingCategory[] | undefined) => {
        if (!list) return;
        for (const sc of list) {
            if (sc.categoryId && sc.name && !map.has(sc.categoryId)) {
                map.set(sc.categoryId, {
                    id: sc.categoryId,
                    name: sc.name,
                    hexColor: sc.hexColor,
                    icon: sc.icon,
                });
            }
        }
    };
    addFromSpending(props.spendingCategories);
    addFromSpending(props.plannedCategories);
    for (const sc of scopedPlannedCategories.value) {
        if (sc.categoryId && sc.name && !map.has(sc.categoryId)) {
            map.set(sc.categoryId, {
                id: sc.categoryId,
                name: sc.name,
                hexColor: sc.hexColor,
                icon: sc.icon,
            });
        }
    }
    return [...map.values()];
});

const categoryById = computed(() => new Map(availableCategories.value.map((c) => [c.id, c])));

const selectedCategoryRows = computed(() => {
    const rows: Array<{
        category: CategoryLike;
        amount: number;
        isRenewed: boolean;
        isPlanned: boolean;
        plannedAmount: number;
    }> = [];
    for (const id of selectedCategoryIds.value) {
        const category = categoryById.value.get(id);
        if (!category) continue;
        rows.push({
            category,
            amount: categoryAmounts.value[id] ?? 0,
            isRenewed: renewedCategoryIds.value.has(id),
            isPlanned: plannedCategoryIds.value.has(id),
            plannedAmount: plannedByCategoryId.value.get(id) ?? 0,
        });
    }
    return rows.sort((a, b) => a.category.name.localeCompare(b.category.name));
});

const pickerCatalog = computed<CategoryLike[]>(() => {
    // The picker must never surface categories that don't belong to the active
    // account owner: backend validation would reject them and mixing owners is
    // a source of confusion.
    if (!activeOwnerId.value) return referenceStore.categories;
    return ownerCategories.value;
});

const pickerCategories = computed(() => {
    return pickerCatalog.value
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
    if (!hasSelectedAccounts.value) return false;
    if (props.mode === "edit") return true;
    return hasAtLeastOneCategory.value;
});

const disabledReason = computed(() => {
    if (budgetedIncome.value < 0.01) return t("budget.dialog.needIncomeHint");
    if (!hasSelectedAccounts.value) return t("budget.dialog.needAccountsHint");
    if (props.mode !== "edit" && !hasAtLeastOneCategory.value) return t("budget.dialog.needCategoryHint");
    return "";
});

function captureSnapshot() {
    initialSnapshot.value = JSON.stringify({
        name: budgetName.value,
        income: budgetedIncome.value,
        amounts: Object.fromEntries([...selectedCategoryIds.value].map((id) => [id, categoryAmounts.value[id] ?? 0])),
        accountIds: [...selectedAccountIds.value].sort(),
    });
}

const isDirty = computed(() => {
    if (!props.open) return false;
    if (isInitializing.value) return false;
    const current = JSON.stringify({
        name: budgetName.value,
        income: budgetedIncome.value,
        amounts: Object.fromEntries([...selectedCategoryIds.value].map((id) => [id, categoryAmounts.value[id] ?? 0])),
        accountIds: [...selectedAccountIds.value].sort(),
    });
    return current !== initialSnapshot.value;
});

function loadFromExisting() {
    plannedCategoryIds.value = new Set();
    if (props.existingBudget) {
        budgetName.value = props.existingBudget.name ?? "";
        budgetedIncome.value = props.existingBudget.budgetedIncome;
        categoryAmounts.value = {};
        selectedCategoryIds.value = new Set();
        selectedAccountIds.value = new Set(props.existingBudget.accountIds ?? []);
        renewedCategoryIds.value = new Set();
        for (const cat of props.existingBudget.categories) {
            categoryAmounts.value[cat.categoryId] = cat.amount;
            selectedCategoryIds.value.add(cat.categoryId);
            if (props.mode === "renew") {
                renewedCategoryIds.value.add(cat.categoryId);
            }
        }
    } else {
        budgetName.value = "";
        budgetedIncome.value = 0;
        categoryAmounts.value = {};
        selectedCategoryIds.value = new Set();
        selectedAccountIds.value = new Set();
        renewedCategoryIds.value = new Set();
    }

    injectPlannedCategories();
}

function injectPlannedCategories() {
    for (const [categoryId, plannedAmount] of plannedByCategoryId.value.entries()) {
        if (selectedCategoryIds.value.has(categoryId)) continue;
        selectedCategoryIds.value.add(categoryId);
        categoryAmounts.value[categoryId] = props.mode === "edit" ? 0 : plannedAmount;
        plannedCategoryIds.value.add(categoryId);
    }
}

function toggleAccount(accountId: string, ownerId: string) {
    // Enforce mono-owner scope: selecting the first account of a different owner
    // wipes the previous selection instead of silently mixing scopes.
    const next = new Set(selectedAccountIds.value);
    if (next.has(accountId)) {
        next.delete(accountId);
    } else {
        if (activeOwnerId.value && activeOwnerId.value !== ownerId) return;
        next.add(accountId);
    }
    selectedAccountIds.value = next;
}

function isAccountDisabled(ownerId: string): boolean {
    if (props.lockAccounts) return true;
    return activeOwnerId.value !== null && activeOwnerId.value !== ownerId;
}

watch(
    () => props.open,
    async (open) => {
        if (!open) return;
        isInitializing.value = true;
        hasStartedFresh.value = false;
        ownerCategories.value = [];
        scopedPlannedCategories.value = [];
        loadFromExisting();
        await nextTick();
        captureSnapshot();
        // Yield one more tick so the activeOwnerId + scopeAccountIds watchers
        // have a chance to fire (and their own captureSnapshot re-runs) before
        // isDirty starts comparing against the initial snapshot.
        await nextTick();
        isInitializing.value = false;
    },
    {immediate: true},
);

watch(activeOwnerId, async (nextOwnerId, prevOwnerId) => {
    if (!props.open) return;

    // Owner switch invalidates every selection (categories belong to an owner).
    if (prevOwnerId !== null && nextOwnerId !== prevOwnerId) {
        selectedCategoryIds.value = new Set();
        categoryAmounts.value = {};
        renewedCategoryIds.value = new Set();
        plannedCategoryIds.value = new Set();
    }

    // Reset upfront so the picker never shows stale cats from the previous
    // owner while the new fetch is in flight.
    ownerCategories.value = [];

    if (!nextOwnerId) return;

    const group = props.accountGroups.find((g) => g.ownerId === nextOwnerId);
    const anchorAccountId = group?.accounts[0]?.id;
    if (!anchorAccountId) return;

    const requestId = ++scopeRequestId.value;
    try {
        const cats = await referenceStore.fetchCategoriesForAccount(anchorAccountId);
        if (requestId !== scopeRequestId.value) return;
        ownerCategories.value = cats.map((c) => ({id: c.id, name: c.name, hexColor: c.hexColor, icon: c.icon}));
        nextTick(() => captureSnapshot());
    } catch {
        if (requestId === scopeRequestId.value) ownerCategories.value = [];
    }
});

watch(
    () => [...selectedAccountIds.value].sort().join(","),
    async (nextKey) => {
        if (!props.open) return;
        if (props.mode !== "create") return;

        const accountIds = nextKey ? nextKey.split(",") : [];
        if (accountIds.length === 0) {
            scopedPlannedCategories.value = [];
            return;
        }

        const requestId = ++plannedRequestId.value;
        try {
            const planned = await budgetStore.getPlannedForAccounts({
                year: props.targetYear,
                month: props.targetMonth,
                accountIds,
            });
            if (requestId !== plannedRequestId.value) return;
            scopedPlannedCategories.value = planned;
            if (!hasStartedFresh.value) {
                injectPlannedCategories();
                nextTick(() => captureSnapshot());
            }
        } catch {
            if (requestId === plannedRequestId.value) scopedPlannedCategories.value = [];
        }
    },
);

function handleSave() {
    const categories = [...selectedCategoryIds.value]
        .map((id) => ({categoryId: id, amount: categoryAmounts.value[id] ?? 0}))
        .filter((c) => c.amount >= 0.01);

    if (props.mode !== "edit" && categories.length === 0) return;
    if (selectedAccountIds.value.size === 0) return;

    const trimmedName = budgetName.value.trim();
    emit("save", {
        name: trimmedName.length === 0 ? null : trimmedName,
        month: props.targetMonth,
        year: props.targetYear,
        budgetedIncome: budgetedIncome.value,
        categories,
        accountIds: [...selectedAccountIds.value],
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
    plannedCategoryIds.value.delete(categoryId);
}

function startFromScratch() {
    budgetedIncome.value = 0;
    categoryAmounts.value = {};
    selectedCategoryIds.value = new Set();
    renewedCategoryIds.value = new Set();
    plannedCategoryIds.value = new Set();
    hasStartedFresh.value = true;

    if (props.mode !== "edit") {
        for (const [categoryId, plannedAmount] of plannedByCategoryId.value.entries()) {
            selectedCategoryIds.value.add(categoryId);
            categoryAmounts.value[categoryId] = plannedAmount;
            plannedCategoryIds.value.add(categoryId);
        }
    }
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

                <!-- Name (optional) -->
                <div class="flex shrink-0 flex-col gap-2">
                    <Label class="text-sm font-medium" for="budgetName">
                        {{ t("budget.dialog.name.label") }}
                    </Label>
                    <Input
                        id="budgetName"
                        v-model="budgetName"
                        maxlength="50"
                        :placeholder="t('budget.dialog.name.placeholder')" />
                    <p class="text-muted-foreground text-xs">{{ t("budget.dialog.name.hint") }}</p>
                </div>

                <!-- Accounts scope -->
                <div class="flex shrink-0 flex-col gap-2">
                    <Label class="text-sm font-medium">{{ t("budget.dialog.accounts.label") }}</Label>
                    <div
                        v-if="!hasWritableAccounts"
                        class="border-border/60 text-muted-foreground rounded-md border border-dashed py-4 text-center text-xs">
                        {{ t("budget.dialog.accounts.noWritable") }}
                    </div>
                    <div v-else class="flex flex-col gap-3">
                        <div
                            v-for="group in accountGroups"
                            :key="group.ownerId"
                            class="border-border/60 rounded-md border p-2">
                            <div class="text-muted-foreground mb-2 px-1 text-xs font-medium tracking-wide uppercase">
                                {{ group.ownerLabel }}
                            </div>
                            <div class="flex flex-col gap-1.5">
                                <label
                                    v-for="account in group.accounts"
                                    :key="account.id"
                                    :class="[
                                        'hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-md p-1.5 transition-colors',
                                        isAccountDisabled(group.ownerId) ? 'cursor-not-allowed opacity-50' : '',
                                    ]">
                                    <span class="flex flex-1 items-center gap-2 text-sm">
                                        <span class="truncate">{{ account.name }}</span>
                                        <AccountSharedBadge :access="account.access" variant="icon" />
                                    </span>
                                    <Switch
                                        size="sm"
                                        :model-value="selectedAccountIds.has(account.id)"
                                        :disabled="isAccountDisabled(group.ownerId)"
                                        @update:model-value="toggleAccount(account.id, group.ownerId)" />
                                </label>
                            </div>
                        </div>
                        <p v-if="lockAccounts" class="text-muted-foreground text-xs">
                            {{ t("budget.dialog.accounts.lockedHint") }}
                        </p>
                        <p v-else class="text-muted-foreground text-xs">
                            {{ t("budget.dialog.accounts.singleOwnerHint") }}
                        </p>
                    </div>
                </div>

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
                                    class="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <span class="flex min-w-0 items-center gap-1.5 truncate text-sm">
                                        <span class="truncate">{{ row.category.name }}</span>
                                        <span
                                            v-if="row.isRenewed && mode === 'renew'"
                                            class="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                                            {{ t("budget.dialog.renewedBadge") }}
                                        </span>
                                        <span
                                            v-if="row.isPlanned"
                                            class="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                                            {{ t("budget.dialog.plannedBadge") }}
                                        </span>
                                    </span>
                                    <span
                                        v-if="row.plannedAmount > 0"
                                        class="text-muted-foreground flex items-center gap-1 text-[11px]">
                                        <Icon class="size-3" name="iconoir:refresh-double" />
                                        {{
                                            t("budget.dialog.plannedFromRecurring", {
                                                amount: toCurrency(row.plannedAmount, currency),
                                            })
                                        }}
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
