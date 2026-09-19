<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {CalendarDate, getLocalTimeZone, today} from "@internationalized/date";
import type {DateRange, DateValue} from "reka-ui";
import {Button} from "~/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {RangeCalendar} from "~/components/ui/range-calendar";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Switch} from "~/components/ui/switch";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {Badge} from "~/components/ui/badge";
import {Label} from "~/components/ui/label";
import {ScrollArea} from "~/components/ui/scroll-area";
import type {Account} from "~/stores/account.store";
import type {TransactionCategory, TransactionMerchant} from "~/stores/reference.store";
import type {BudgetedFilter} from "~/stores/report.store";
import {
    REPORT_RANGES,
    REPORT_RESOLUTIONS,
    type ReportRange,
    type ReportResolution,
    buildReportDateRange,
} from "~/utils/reports";

const props = defineProps<{
    accounts: Account[];
    categories: TransactionCategory[];
    merchants: TransactionMerchant[];
    range: ReportRange;
    startDate: string;
    endDate: string;
    accountIds: string[];
    categoryIds: string[];
    merchantIds: string[];
    includeShared: boolean;
    excludeTransfers: boolean;
    includeRebalances: boolean;
    budgeted: BudgetedFilter;
    resolutionOverride: ReportResolution | null;
    effectiveResolution: ReportResolution;
    loading?: boolean;
}>();

const emit = defineEmits<{
    "update:range": [ReportRange];
    "update:startDate": [string];
    "update:endDate": [string];
    "update:accountIds": [string[]];
    "update:categoryIds": [string[]];
    "update:merchantIds": [string[]];
    "update:includeShared": [boolean];
    "update:excludeTransfers": [boolean];
    "update:includeRebalances": [boolean];
    "update:budgeted": [BudgetedFilter];
    "update:resolutionOverride": [ReportResolution | null];
}>();

const {t, locale} = useI18n();

const localTz = getLocalTimeZone();

const rangeDraft = ref<DateRange>({start: undefined, end: undefined});
const isCustomOpen = ref(false);
const isAccountsOpen = ref(false);
const isCategoriesOpen = ref(false);
const isMerchantsOpen = ref(false);
const isBudgetedOpen = ref(false);

function isoToDateValue(iso: string): DateValue | undefined {
    try {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return undefined;
        return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
    } catch {
        return undefined;
    }
}

function dateValueToStartIso(value: DateValue): string {
    const dt = value.toDate(localTz);
    dt.setHours(0, 0, 0, 0);
    return dt.toISOString();
}

function dateValueToEndIso(value: DateValue): string {
    const dt = value.toDate(localTz);
    dt.setHours(23, 59, 59, 999);
    return dt.toISOString();
}

function openCustomPicker(open: boolean) {
    isCustomOpen.value = open;
    if (open) {
        rangeDraft.value = {
            start: isoToDateValue(props.startDate),
            end: isoToDateValue(props.endDate),
        };
    }
}

function selectPreset(value: string) {
    const preset = value as ReportRange;
    if (preset === "CUSTOM") return;
    const {startDate, endDate} = buildReportDateRange(preset);
    emit("update:range", preset);
    emit("update:startDate", startDate);
    emit("update:endDate", endDate);
}

function applyCustomRange() {
    if (!rangeDraft.value.start || !rangeDraft.value.end) return;
    emit("update:range", "CUSTOM");
    emit("update:startDate", dateValueToStartIso(rangeDraft.value.start));
    emit("update:endDate", dateValueToEndIso(rangeDraft.value.end));
    isCustomOpen.value = false;
}

const canApplyCustom = computed(() => !!rangeDraft.value.start && !!rangeDraft.value.end);

const dateFormatter = computed(
    () => new Intl.DateTimeFormat(locale.value || "en-US", {year: "numeric", month: "short", day: "numeric"}),
);

const customLabel = computed(() => {
    if (props.range !== "CUSTOM") return t("reports.filters.custom");
    const start = dateFormatter.value.format(new Date(props.startDate));
    const end = dateFormatter.value.format(new Date(props.endDate));
    return `${start} → ${end}`;
});

const filteredAccounts = computed(() =>
    props.includeShared ? props.accounts : props.accounts.filter((a) => a.access === "owner"),
);

const accountsGrouped = computed(() => {
    const map = new Map<string, Account[]>();
    for (const acc of filteredAccounts.value) {
        const key = acc.access === "owner" ? "__owned__" : `shared-${acc.ownerId}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(acc);
    }
    return [...map.entries()]
        .map(([key, accounts]) => ({
            key,
            label:
                key === "__owned__"
                    ? t("reports.filters.accountsOwned")
                    : t("reports.filters.accountsSharedBy", {name: accounts[0]!.ownerUsername}),
            accounts: [...accounts].sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => (a.key === "__owned__" ? -1 : b.key === "__owned__" ? 1 : 0));
});

const selectedAccountIdsSet = computed(() => new Set(props.accountIds));

function toggleAccount(id: string) {
    const set = new Set(props.accountIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    emit("update:accountIds", [...set]);
}

function selectAllAccounts() {
    emit(
        "update:accountIds",
        filteredAccounts.value.map((a) => a.id),
    );
}

function clearAccounts() {
    emit("update:accountIds", []);
}

const accountsSummary = computed(() => {
    const count = props.accountIds.length;
    if (count === 0) return t("reports.filters.accountsAll");
    if (count === 1) {
        const single = props.accounts.find((a) => a.id === props.accountIds[0]);
        return single?.name ?? t("reports.filters.accountsCount", {count});
    }
    return t("reports.filters.accountsCount", {count});
});

const sortedCategories = computed(() => [...props.categories].sort((a, b) => a.name.localeCompare(b.name)));
const selectedCategoryIdsSet = computed(() => new Set(props.categoryIds));

function toggleCategory(id: string) {
    const set = new Set(props.categoryIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    emit("update:categoryIds", [...set]);
}

function selectAllCategories() {
    emit(
        "update:categoryIds",
        sortedCategories.value.map((c) => c.id),
    );
}

function clearCategories() {
    emit("update:categoryIds", []);
}

const categoriesSummary = computed(() => {
    const count = props.categoryIds.length;
    if (count === 0) return t("reports.filters.categoriesAll");
    if (count === 1) {
        const single = props.categories.find((c) => c.id === props.categoryIds[0]);
        return single?.name ?? t("reports.filters.categoriesCount", {count});
    }
    return t("reports.filters.categoriesCount", {count});
});

const sortedMerchants = computed(() => [...props.merchants].sort((a, b) => a.name.localeCompare(b.name)));
const selectedMerchantIdsSet = computed(() => new Set(props.merchantIds));

function toggleMerchant(id: string) {
    const set = new Set(props.merchantIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    emit("update:merchantIds", [...set]);
}

function selectAllMerchants() {
    emit(
        "update:merchantIds",
        sortedMerchants.value.map((m) => m.id),
    );
}

function clearMerchants() {
    emit("update:merchantIds", []);
}

const merchantsSummary = computed(() => {
    const count = props.merchantIds.length;
    if (count === 0) return t("reports.filters.merchantsAll");
    if (count === 1) {
        const single = props.merchants.find((m) => m.id === props.merchantIds[0]);
        return single?.name ?? t("reports.filters.merchantsCount", {count});
    }
    return t("reports.filters.merchantsCount", {count});
});

const budgetedOptions: {value: BudgetedFilter; icon: string}[] = [
    {value: "all", icon: "iconoir:list"},
    {value: "budgeted", icon: "iconoir:piggy-bank"},
    {value: "unbudgeted", icon: "iconoir:eye-closed"},
];

function selectBudgeted(value: BudgetedFilter) {
    emit("update:budgeted", value);
    isBudgetedOpen.value = false;
}

const budgetedSummary = computed(() => t(`reports.filters.budgeted.${props.budgeted}`));

const resolutionSelectValue = computed({
    get: () => props.resolutionOverride ?? "auto",
    set: (v: string) => {
        if (v === "auto") emit("update:resolutionOverride", null);
        else emit("update:resolutionOverride", v as ReportResolution);
    },
});

// When toggling includeShared off, drop any shared account currently selected.
watch(
    () => props.includeShared,
    (val) => {
        if (val) return;
        const ownedIds = new Set(props.accounts.filter((a) => a.access === "owner").map((a) => a.id));
        const filtered = props.accountIds.filter((id) => ownedIds.has(id));
        if (filtered.length !== props.accountIds.length) {
            emit("update:accountIds", filtered);
        }
    },
);

// Year range for the range calendar (support ALL preset going back to 2000).
const yearRange = computed(() => {
    const seed = today(localTz).set({month: 1, day: 1});
    const currentYear = seed.year;
    const years: DateValue[] = [];
    for (let year = 2000; year <= currentYear + 1; year++) {
        years.push(seed.set({year}));
    }
    return years;
});
</script>

<template>
    <div
        class="border-border/60 bg-card flex flex-col gap-3 rounded-2xl border p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        <Tabs :model-value="range" class="w-full sm:w-auto" @update:model-value="(v) => v && selectPreset(String(v))">
            <TabsList>
                <TabsTrigger v-for="preset in REPORT_RANGES" :key="preset" :value="preset">
                    {{ t(`reports.filters.presets.${preset}`) }}
                </TabsTrigger>
            </TabsList>
        </Tabs>

        <Popover :open="isCustomOpen" @update:open="openCustomPicker">
            <PopoverTrigger as-child>
                <Button variant="outline" size="sm" class="justify-start gap-2">
                    <Icon class="size-4" name="iconoir:calendar" />
                    <span class="truncate">{{ customLabel }}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-2" align="start">
                <div class="flex flex-col gap-2">
                    <RangeCalendar v-model="rangeDraft" :year-range="yearRange" />
                    <div class="flex justify-end gap-2">
                        <Button variant="outline" size="sm" @click="isCustomOpen = false">
                            {{ t("common.cancel") }}
                        </Button>
                        <Button size="sm" :disabled="!canApplyCustom" @click="applyCustomRange">
                            {{ t("reports.filters.applyRange") }}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>

        <div class="bg-border/60 hidden h-6 w-px shrink-0 sm:block"></div>

        <Popover :open="isAccountsOpen" @update:open="isAccountsOpen = $event">
            <PopoverTrigger as-child>
                <Button variant="outline" size="sm" class="justify-start gap-2">
                    <Icon class="size-4" name="iconoir:wallet" />
                    <span class="truncate">{{ accountsSummary }}</span>
                    <Badge v-if="accountIds.length > 0" variant="secondary" class="ml-1">
                        {{ accountIds.length }}
                    </Badge>
                </Button>
            </PopoverTrigger>
            <PopoverContent class="w-72 p-3" align="start">
                <div class="mb-2 flex items-center justify-between">
                    <p class="text-sm font-medium">{{ t("reports.filters.accountsTitle") }}</p>
                    <div class="flex gap-1">
                        <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="selectAllAccounts">
                            {{ t("reports.filters.selectAll") }}
                        </Button>
                        <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="clearAccounts">
                            {{ t("reports.filters.clear") }}
                        </Button>
                    </div>
                </div>
                <p class="text-muted-foreground mb-2 text-xs">{{ t("reports.filters.accountsHint") }}</p>
                <ScrollArea class="max-h-72">
                    <div v-for="group in accountsGrouped" :key="group.key" class="mb-2">
                        <p class="text-muted-foreground mb-1 text-[0.68rem] font-medium tracking-[0.08em] uppercase">
                            {{ group.label }}
                        </p>
                        <ul class="flex flex-col gap-0.5">
                            <li v-for="account in group.accounts" :key="account.id">
                                <button
                                    type="button"
                                    :class="[
                                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                                        selectedAccountIdsSet.has(account.id)
                                            ? 'bg-primary/10 text-foreground'
                                            : 'hover:bg-muted text-muted-foreground',
                                    ]"
                                    @click="toggleAccount(account.id)">
                                    <Icon
                                        :name="
                                            selectedAccountIdsSet.has(account.id)
                                                ? 'iconoir:check-square'
                                                : 'iconoir:square'
                                        "
                                        class="size-4 shrink-0" />
                                    <span class="truncate">{{ account.name }}</span>
                                </button>
                            </li>
                        </ul>
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>

        <Popover :open="isCategoriesOpen" @update:open="isCategoriesOpen = $event">
            <PopoverTrigger as-child>
                <Button variant="outline" size="sm" class="justify-start gap-2">
                    <Icon class="size-4" name="iconoir:pizza-slice" />
                    <span class="truncate">{{ categoriesSummary }}</span>
                    <Badge v-if="categoryIds.length > 0" variant="secondary" class="ml-1">
                        {{ categoryIds.length }}
                    </Badge>
                </Button>
            </PopoverTrigger>
            <PopoverContent class="w-72 p-3" align="start">
                <div class="mb-2 flex items-center justify-between">
                    <p class="text-sm font-medium">{{ t("reports.filters.categoriesTitle") }}</p>
                    <div class="flex gap-1">
                        <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="selectAllCategories">
                            {{ t("reports.filters.selectAll") }}
                        </Button>
                        <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="clearCategories">
                            {{ t("reports.filters.clear") }}
                        </Button>
                    </div>
                </div>
                <p class="text-muted-foreground mb-2 text-xs">{{ t("reports.filters.categoriesHint") }}</p>
                <ScrollArea class="max-h-72">
                    <ul class="flex flex-col gap-0.5">
                        <li v-for="category in sortedCategories" :key="category.id">
                            <button
                                type="button"
                                :class="[
                                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                                    selectedCategoryIdsSet.has(category.id)
                                        ? 'bg-primary/10 text-foreground'
                                        : 'hover:bg-muted text-muted-foreground',
                                ]"
                                @click="toggleCategory(category.id)">
                                <Icon
                                    :name="
                                        selectedCategoryIdsSet.has(category.id)
                                            ? 'iconoir:check-square'
                                            : 'iconoir:square'
                                    "
                                    class="size-4 shrink-0" />
                                <span
                                    class="inline-block size-2 shrink-0 rounded-full"
                                    :style="{backgroundColor: category.hexColor}"></span>
                                <span class="truncate">{{ category.name }}</span>
                            </button>
                        </li>
                    </ul>
                </ScrollArea>
            </PopoverContent>
        </Popover>

        <Popover :open="isMerchantsOpen" @update:open="isMerchantsOpen = $event">
            <PopoverTrigger as-child>
                <Button variant="outline" size="sm" class="justify-start gap-2">
                    <Icon class="size-4" name="iconoir:shop" />
                    <span class="truncate">{{ merchantsSummary }}</span>
                    <Badge v-if="merchantIds.length > 0" variant="secondary" class="ml-1">
                        {{ merchantIds.length }}
                    </Badge>
                </Button>
            </PopoverTrigger>
            <PopoverContent class="w-72 p-3" align="start">
                <div class="mb-2 flex items-center justify-between">
                    <p class="text-sm font-medium">{{ t("reports.filters.merchantsTitle") }}</p>
                    <div class="flex gap-1">
                        <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="selectAllMerchants">
                            {{ t("reports.filters.selectAll") }}
                        </Button>
                        <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="clearMerchants">
                            {{ t("reports.filters.clear") }}
                        </Button>
                    </div>
                </div>
                <p class="text-muted-foreground mb-2 text-xs">{{ t("reports.filters.merchantsHint") }}</p>
                <ScrollArea class="max-h-72">
                    <ul class="flex flex-col gap-0.5">
                        <li v-for="merchant in sortedMerchants" :key="merchant.id">
                            <button
                                type="button"
                                :class="[
                                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                                    selectedMerchantIdsSet.has(merchant.id)
                                        ? 'bg-primary/10 text-foreground'
                                        : 'hover:bg-muted text-muted-foreground',
                                ]"
                                @click="toggleMerchant(merchant.id)">
                                <Icon
                                    :name="
                                        selectedMerchantIdsSet.has(merchant.id)
                                            ? 'iconoir:check-square'
                                            : 'iconoir:square'
                                    "
                                    class="size-4 shrink-0" />
                                <span class="truncate">{{ merchant.name }}</span>
                            </button>
                        </li>
                    </ul>
                </ScrollArea>
            </PopoverContent>
        </Popover>

        <Popover :open="isBudgetedOpen" @update:open="isBudgetedOpen = $event">
            <PopoverTrigger as-child>
                <Button variant="outline" size="sm" class="justify-start gap-2">
                    <Icon class="size-4" name="iconoir:piggy-bank" />
                    <span class="truncate">{{ budgetedSummary }}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent class="w-56 p-2" align="start">
                <p class="text-muted-foreground mb-1 px-2 pt-1 text-[0.68rem] font-medium tracking-[0.08em] uppercase">
                    {{ t("reports.filters.budgetedTitle") }}
                </p>
                <ul class="flex flex-col gap-0.5">
                    <li v-for="option in budgetedOptions" :key="option.value">
                        <button
                            type="button"
                            :class="[
                                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                                budgeted === option.value
                                    ? 'bg-primary/10 text-foreground'
                                    : 'hover:bg-muted text-muted-foreground',
                            ]"
                            @click="selectBudgeted(option.value)">
                            <Icon
                                :name="budgeted === option.value ? 'iconoir:check-circle' : 'iconoir:circle'"
                                class="size-4 shrink-0" />
                            <Icon :name="option.icon" class="text-muted-foreground size-3.5 shrink-0" />
                            <span class="truncate">{{ t(`reports.filters.budgeted.${option.value}`) }}</span>
                        </button>
                    </li>
                </ul>
            </PopoverContent>
        </Popover>

        <Select v-model="resolutionSelectValue">
            <SelectTrigger class="h-9 w-auto min-w-[9rem] gap-2 text-sm">
                <Icon class="size-4" name="iconoir:hourglass" />
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="auto">
                    {{
                        t("reports.filters.resolution.auto", {
                            value: t(`reports.filters.resolution.${effectiveResolution}`),
                        })
                    }}
                </SelectItem>
                <SelectItem v-for="res in REPORT_RESOLUTIONS" :key="res" :value="res">
                    {{ t(`reports.filters.resolution.${res}`) }}
                </SelectItem>
            </SelectContent>
        </Select>

        <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-2">
                <Switch
                    id="report-include-shared"
                    :model-value="includeShared"
                    size="sm"
                    @update:model-value="emit('update:includeShared', Boolean($event))" />
                <Label for="report-include-shared" class="text-muted-foreground cursor-pointer text-xs">
                    {{ t("reports.filters.includeShared") }}
                </Label>
            </div>

            <div class="flex items-center gap-2">
                <Switch
                    id="report-exclude-transfers"
                    :model-value="excludeTransfers"
                    size="sm"
                    @update:model-value="emit('update:excludeTransfers', Boolean($event))" />
                <Label for="report-exclude-transfers" class="text-muted-foreground cursor-pointer text-xs">
                    {{ t("reports.filters.excludeTransfers") }}
                </Label>
            </div>

            <div class="flex items-center gap-2">
                <Switch
                    id="report-include-rebalances"
                    :model-value="includeRebalances"
                    size="sm"
                    @update:model-value="emit('update:includeRebalances', Boolean($event))" />
                <Label for="report-include-rebalances" class="text-muted-foreground cursor-pointer text-xs">
                    {{ t("reports.filters.includeRebalances") }}
                </Label>
            </div>
        </div>

        <div v-if="loading" class="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
            <Icon class="size-3 animate-spin" name="svg-spinners:180-ring-with-bg" />
            {{ t("common.loading") }}
        </div>
    </div>
</template>
