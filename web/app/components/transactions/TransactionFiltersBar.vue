<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import type {DateRange} from "reka-ui";
import {useMediaQuery} from "@vueuse/core";
import {useI18n} from "vue-i18n";

import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger} from "@/components/ui/sheet";
import {Badge} from "@/components/ui/badge";
import TransactionDateRangePicker from "./TransactionDateRangePicker.vue";

export type TransactionFilters = {
    search: string;
    type: "all" | "income" | "expense";
    accountId: string | "all";
    categoryId: string | "all";
    merchantId: string | "all";
    rebalance: "all" | "only" | "exclude";
    dateRange: DateRange;
};

const props = defineProps<{
    modelValue: TransactionFilters;
    availableCategories: {id: string; name: string}[];
    availableMerchants: {id: string; name: string}[];
    availableAccounts?: {id: string; name: string}[];
    showAccountFilter?: boolean;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: TransactionFilters): void;
}>();

const isMobile = useMediaQuery("(max-width: 768px)");
const isReducedHeight = useMediaQuery("(max-height: 1080px)");
const {t} = useI18n();
const DESKTOP_FILTERS_VISIBILITY_STORAGE_KEY = "flowy:transactions:desktop-filters-visible";

// Local state to avoid mutating props directly
const filters = ref<TransactionFilters>({...props.modelValue});

// Initialize DateRange correctly if it's not present
if (!filters.value.dateRange) {
    filters.value.dateRange = {start: undefined, end: undefined};
}

if (!filters.value.accountId) {
    filters.value.accountId = "all";
}

// Watch for changes in local state and emit to parent
watch(
    filters,
    (newFilters) => {
        emit("update:modelValue", {...newFilters});
    },
    {deep: true},
);

const isSheetOpen = ref(false);
const areDesktopFiltersVisible = ref(true);
const hasStoredDesktopFiltersPreference = ref(false);
const desktopFiltersContentId = "transactions-desktop-filters-content";

const activeFilterCount = computed(() => {
    let count = 0;
    if (filters.value.type !== "all") count++;
    if (props.showAccountFilter && filters.value.accountId !== "all") count++;
    if (filters.value.categoryId !== "all") count++;
    if (filters.value.merchantId !== "all") count++;
    if (filters.value.rebalance !== "all") count++;
    if (filters.value.dateRange?.start || filters.value.dateRange?.end) count++;
    return count;
});

const hasActiveFilters = computed(() => {
    return activeFilterCount.value > 0 || filters.value.search !== "";
});

const resetFilters = () => {
    filters.value = {
        search: "",
        type: "all",
        accountId: "all",
        categoryId: "all",
        merchantId: "all",
        rebalance: "all",
        dateRange: {start: undefined, end: undefined},
    };
};

const toggleDesktopFilters = () => {
    areDesktopFiltersVisible.value = !areDesktopFiltersVisible.value;
};

onMounted(() => {
    if (!process.client) {
        return;
    }

    const persistedVisibility = window.localStorage.getItem(DESKTOP_FILTERS_VISIBILITY_STORAGE_KEY);
    if (persistedVisibility === "true" || persistedVisibility === "false") {
        hasStoredDesktopFiltersPreference.value = true;
        areDesktopFiltersVisible.value = persistedVisibility === "true";
        return;
    }

    areDesktopFiltersVisible.value = !isReducedHeight.value;
});

watch(areDesktopFiltersVisible, (isVisible) => {
    if (!process.client) {
        return;
    }

    window.localStorage.setItem(DESKTOP_FILTERS_VISIBILITY_STORAGE_KEY, isVisible ? "true" : "false");
});

watch(isReducedHeight, (isCompact) => {
    if (hasStoredDesktopFiltersPreference.value || isMobile.value) {
        return;
    }

    areDesktopFiltersVisible.value = !isCompact;
});
</script>

<template>
    <div class="flex flex-col gap-4">
        <!-- Desktop Layout -->
        <div class="hidden md:flex md:flex-col md:gap-4">
            <!-- Search & Actions Row -->
            <div class="flex items-center justify-between gap-2">
                <div class="flex flex-1 items-center gap-2">
                    <div class="relative max-w-sm flex-1">
                        <Icon class="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" name="iconoir:search" />
                        <Input
                            v-model="filters.search"
                            class="pl-8"
                            :placeholder="
                                props.showAccountFilter
                                    ? t('transactions.filters.searchWithAccount')
                                    : t('transactions.filters.search')
                            " />
                    </div>
                    <Button v-if="hasActiveFilters" class="h-9 px-3" size="sm" variant="ghost" @click="resetFilters">
                        <Icon class="h-4 w-4" name="iconoir:cancel" />
                        {{ t("transactions.filters.clear") }}
                    </Button>
                </div>
                <Button
                    :aria-controls="desktopFiltersContentId"
                    :aria-expanded="areDesktopFiltersVisible"
                    class="h-9 shrink-0 px-3"
                    size="sm"
                    variant="outline"
                    @click="toggleDesktopFilters">
                    <Icon class="h-4 w-4" name="iconoir:filter" />
                    {{
                        areDesktopFiltersVisible
                            ? t("transactions.filters.hideAdvanced")
                            : t("transactions.filters.showAdvanced")
                    }}
                </Button>
            </div>

            <!-- Filters Row -->
            <div
                v-show="areDesktopFiltersVisible"
                :id="desktopFiltersContentId"
                class="flex flex-wrap items-center gap-2">
                <Select v-model="filters.type">
                    <SelectTrigger class="w-35">
                        <SelectValue :placeholder="t('transactions.filters.type')" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{{ t("transactions.filters.allTypes") }}</SelectItem>
                        <SelectItem value="income">{{ t("transactions.filters.income") }}</SelectItem>
                        <SelectItem value="expense">{{ t("transactions.filters.expense") }}</SelectItem>
                    </SelectContent>
                </Select>

                <Select v-if="props.showAccountFilter" v-model="filters.accountId">
                    <SelectTrigger class="w-[170px]">
                        <SelectValue :placeholder="t('transactions.filters.account')" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{{ t("transactions.filters.allAccounts") }}</SelectItem>
                        <SelectItem
                            v-for="account in props.availableAccounts || []"
                            :key="account.id"
                            :value="account.id">
                            {{ account.name }}
                        </SelectItem>
                    </SelectContent>
                </Select>

                <Select v-model="filters.categoryId">
                    <SelectTrigger class="w-40">
                        <SelectValue :placeholder="t('transactions.filters.category')" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{{ t("transactions.filters.allCategories") }}</SelectItem>
                        <SelectItem v-for="category in availableCategories" :key="category.id" :value="category.id">
                            {{ category.name }}
                        </SelectItem>
                    </SelectContent>
                </Select>

                <Select v-model="filters.merchantId">
                    <SelectTrigger class="w-[160px]">
                        <SelectValue :placeholder="t('transactions.filters.merchant')" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{{ t("transactions.filters.allMerchants") }}</SelectItem>
                        <SelectItem v-for="merchant in availableMerchants" :key="merchant.id" :value="merchant.id">
                            {{ merchant.name }}
                        </SelectItem>
                    </SelectContent>
                </Select>

                <Select v-model="filters.rebalance">
                    <SelectTrigger class="w-40">
                        <SelectValue :placeholder="t('transactions.filters.rebalance')" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{{ t("transactions.filters.includeRebalance") }}</SelectItem>
                        <SelectItem value="exclude">{{ t("transactions.filters.excludeRebalance") }}</SelectItem>
                        <SelectItem value="only">{{ t("transactions.filters.onlyRebalance") }}</SelectItem>
                    </SelectContent>
                </Select>

                <TransactionDateRangePicker v-model="filters.dateRange" />
            </div>
        </div>

        <!-- Mobile Layout -->
        <div class="flex items-center gap-2 md:hidden">
            <div class="relative flex-1">
                <Icon class="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" name="iconoir:search" />
                <Input v-model="filters.search" class="pl-8" :placeholder="t('transactions.filters.searchMobile')" />
            </div>

            <Sheet v-model:open="isSheetOpen">
                <SheetTrigger as-child>
                    <Button class="relative shrink-0" size="icon" variant="outline">
                        <Icon class="h-4 w-4" name="iconoir:filter" />
                        <Badge
                            v-if="activeFilterCount > 0"
                            class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full p-0 text-[10px]">
                            {{ activeFilterCount }}
                        </Badge>
                    </Button>
                </SheetTrigger>
                <SheetContent class="h-[85vh] rounded-t-xl px-4" side="bottom">
                    <SheetHeader class="mb-6 text-left">
                        <div class="flex items-center justify-between">
                            <SheetTitle>{{ t("transactions.filters.title") }}</SheetTitle>
                            <Button
                                v-if="hasActiveFilters"
                                class="-mr-2 h-8 px-2"
                                size="sm"
                                variant="ghost"
                                @click="resetFilters">
                                <Icon class="h-4 w-4" name="iconoir:cancel" />
                                {{ t("transactions.filters.clear") }}
                            </Button>
                        </div>
                    </SheetHeader>

                    <div class="flex flex-col gap-6 overflow-y-auto pb-10">
                        <div class="space-y-2">
                            <label
                                class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {{ t("transactions.filters.dateRange") }}
                            </label>
                            <TransactionDateRangePicker v-model="filters.dateRange" class="w-full" />
                        </div>

                        <div class="space-y-2">
                            <label
                                class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {{ t("transactions.filters.type") }}
                            </label>
                            <Select v-model="filters.type">
                                <SelectTrigger class="w-full">
                                    <SelectValue :placeholder="t('transactions.filters.type')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{{ t("transactions.filters.allTypes") }}</SelectItem>
                                    <SelectItem value="income">{{ t("transactions.filters.income") }}</SelectItem>
                                    <SelectItem value="expense">{{ t("transactions.filters.expense") }}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div v-if="props.showAccountFilter" class="space-y-2">
                            <label
                                class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {{ t("transactions.filters.account") }}
                            </label>
                            <Select v-model="filters.accountId">
                                <SelectTrigger class="w-full">
                                    <SelectValue :placeholder="t('transactions.filters.account')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{{ t("transactions.filters.allAccounts") }}</SelectItem>
                                    <SelectItem
                                        v-for="account in props.availableAccounts || []"
                                        :key="account.id"
                                        :value="account.id">
                                        {{ account.name }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div class="space-y-2">
                            <label
                                class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {{ t("transactions.filters.category") }}
                            </label>
                            <Select v-model="filters.categoryId">
                                <SelectTrigger class="w-full">
                                    <SelectValue :placeholder="t('transactions.filters.category')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{{ t("transactions.filters.allCategories") }}</SelectItem>
                                    <SelectItem
                                        v-for="category in availableCategories"
                                        :key="category.id"
                                        :value="category.id">
                                        {{ category.name }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div class="space-y-2">
                            <label
                                class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {{ t("transactions.filters.merchant") }}
                            </label>
                            <Select v-model="filters.merchantId">
                                <SelectTrigger class="w-full">
                                    <SelectValue :placeholder="t('transactions.filters.merchant')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{{ t("transactions.filters.allMerchants") }}</SelectItem>
                                    <SelectItem
                                        v-for="merchant in availableMerchants"
                                        :key="merchant.id"
                                        :value="merchant.id">
                                        {{ merchant.name }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div class="space-y-2">
                            <label
                                class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {{ t("transactions.filters.rebalance") }}
                            </label>
                            <Select v-model="filters.rebalance">
                                <SelectTrigger class="w-full">
                                    <SelectValue :placeholder="t('transactions.filters.rebalance')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{{ t("transactions.filters.includeRebalance") }}</SelectItem>
                                    <SelectItem value="exclude">{{
                                        t("transactions.filters.excludeRebalance")
                                    }}</SelectItem>
                                    <SelectItem value="only">{{ t("transactions.filters.onlyRebalance") }}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div class="mt-2">
                            <Button class="w-full" @click="isSheetOpen = false">
                                {{ t("transactions.filters.apply") }}
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    </div>
</template>
