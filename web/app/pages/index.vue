<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useCssVar, useMediaQuery, useStorage} from "@vueuse/core";
import {useRouter} from "vue-router";
import {cn} from "~/lib/utils";
import {useFamilyStore} from "~/stores/family.store";
import type {Account} from "~/stores/account.store";
import {useAccountStore} from "~/stores/account.store";
import {useUserStore} from "~/stores/user.store";
import type {TimeRange} from "~/utils/accounts";
import {
    buildDateRange,
    computeCategoryStats,
    computeTotalBalance,
    groupAccountsByType,
    mergeAccountEvolutionSeries,
} from "~/utils/accounts";
import {toCurrency} from "~/lib/currency";
import AccountFormModal from "~/components/accounts/AccountFormModal.vue";
import {Button} from "~/components/ui/button";
import {Skeleton} from "~/components/ui/skeleton";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "~/components/ui/dropdown-menu";
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
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "~/components/ui/collapsible";
import {ScrollArea} from "~/components/ui/scroll-area";
import {ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent} from "~/components/ui/chart";
import {VisArea, VisAxis, VisLine, VisScatter, VisXYContainer} from "@unovis/vue";
import {CurveType} from "@unovis/ts";

const {locale, t} = useI18n();

const chartConfig = computed(() => ({
    balance: {label: t("dashboard.balance"), color: "var(--chart-1)"},
}));

const x = (d: {date: string}) => new Date(d.date).getTime();
const y = (d: {balance: number}) => d.balance;

const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const userStore = useUserStore();
const router = useRouter();

const isMobile = useMediaQuery("(max-width: 768px)");
const isCompactHeight = useMediaQuery("(max-height: 1080px)");
const isVeryCompactHeight = useMediaQuery("(max-height: 920px)");

const graphHeightClass = computed(() =>
    cn("md:mx-0", {
        "-mx-3 mt-2 h-[150px] md:h-[170px]": isVeryCompactHeight.value,
        "-mx-4 mt-3 h-[180px] md:h-[210px]": !isVeryCompactHeight.value && isCompactHeight.value,
        "-mx-6 mt-6 h-[260px] md:h-[300px]": !isVeryCompactHeight.value && !isCompactHeight.value,
    }),
);

const isLoading = ref(true);
const isCreating = ref(false);
const accountToEdit = ref<Account | null>(null);
const isFormModalOpen = ref(false);

const accountToDelete = ref<Account | null>(null);
const isDeleteDialogOpen = ref(false);

const timeRange = ref<TimeRange>("1M");
const globalEvolutionSeries = ref<{date: string; balance: number}[]>([]);

const collapsedCategories = useStorage<Record<string, boolean>>("flowy_collapsed_categories", {});

// Read chart colors from CSS tokens (light/dark aware)
const successVar = useCssVar("--success");
const destructiveVar = useCssVar("--destructive");
const mutedFgVar = useCssVar("--muted-foreground");

const chartColor = computed(() => {
    const series = globalEvolutionSeries.value;
    const fallback = mutedFgVar.value?.trim() || "oklch(0.5 0.02 250)";
    if (!series || series.length === 0) return fallback;
    const startValue = series[0].balance;
    const endValue = series[series.length - 1].balance;

    if (endValue > startValue) return successVar.value?.trim() || fallback;
    if (endValue < startValue) return destructiveVar.value?.trim() || fallback;
    return fallback;
});

const totalBalance = computed(() => computeTotalBalance(accountStore.accounts));
const groupedAccounts = computed(() => groupAccountsByType(accountStore.accounts));
const categoryStats = computed(() => computeCategoryStats(groupedAccounts.value));

// KPI count-up animation
const displayedBalance = ref(0);
let rafHandle: number | null = null;
function animateBalance(from: number, to: number) {
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        displayedBalance.value = to;
        return;
    }
    const duration = 500;
    const start = performance.now();
    const step = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        displayedBalance.value = from + (to - from) * eased;
        if (progress < 1) rafHandle = requestAnimationFrame(step);
        else rafHandle = null;
    };
    rafHandle = requestAnimationFrame(step);
}
watch(totalBalance, (v, prev) => animateBalance(prev ?? 0, v), {immediate: false});

const loadData = async () => {
    isLoading.value = true;
    try {
        await Promise.all([accountStore.fetchAccounts(), familyStore.fetchFamily()]);
        await loadChartData();
        animateBalance(0, totalBalance.value);
    } catch (err) {
        console.error(err);
    } finally {
        isLoading.value = false;
    }
};

const loadChartData = async () => {
    const {startDate, endDate} = buildDateRange(timeRange.value);
    const seriesByAccount: Record<string, {date: string; balance: number}[]> = {};

    await Promise.all(
        accountStore.accounts.map(async (account) => {
            seriesByAccount[account.id] = await accountStore.fetchAccountBalanceEvolution(
                account.id,
                startDate,
                endDate,
            );
        }),
    );

    globalEvolutionSeries.value = mergeAccountEvolutionSeries(seriesByAccount);
};

onMounted(loadData);

watch(timeRange, () => {
    loadChartData();
});

const openCreateModal = () => {
    accountToEdit.value = null;
    isFormModalOpen.value = true;
};

const route = useRoute();
watch(
    () => route.query.new,
    (value) => {
        if (value) {
            openCreateModal();
            const {new: _drop, ...rest} = route.query;
            router.replace({query: rest});
        }
    },
    {immediate: true},
);

const openEditModal = (account: Account) => {
    accountToEdit.value = account;
    isFormModalOpen.value = true;
};

const confirmDelete = (account: Account) => {
    accountToDelete.value = account;
    isDeleteDialogOpen.value = true;
};

const executeDelete = async () => {
    if (accountToDelete.value) {
        await accountStore.deleteAccount(accountToDelete.value.id);
        accountToDelete.value = null;
        await loadData();
    }
};

const onFormSaved = () => {
    loadData();
};

const goToDetails = (id: string) => {
    router.push(`/account/${id}`);
};

const formatCurrency = (value: number) => {
    const currency = familyStore.family?.currency || "USD";
    return toCurrency(value, currency);
};

const formatCompactCurrency = (value: number) => {
    const currency = familyStore.family?.currency || "USD";
    return toCurrency(value, currency);
};
</script>

<template>
    <div class="w-full">
        <div class="mx-auto max-w-7xl">
            <div class="animate-fade-in-up flex flex-col gap-6 md:h-[calc(100dvh-4rem-1.5rem)]">
                <!-- Header -->
                <div class="flex shrink-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div class="flex items-center gap-3">
                        <div class="relative">
                            <span
                                aria-hidden="true"
                                class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
                            <div
                                class="bg-brand-gradient-soft border-border/60 relative flex size-12 items-center justify-center rounded-xl border">
                                <Icon class="text-primary size-6" name="iconoir:bank" />
                            </div>
                        </div>
                        <div>
                            <h1 class="font-heading text-2xl font-semibold tracking-tight">
                                {{ t("dashboard.welcome", {name: userStore.user?.username ?? t("common.user")}) }}
                            </h1>
                            <p class="text-muted-foreground text-sm">{{ t("dashboard.subtitle") }}</p>
                        </div>
                    </div>
                    <Button class="w-full md:w-auto" @click="openCreateModal">
                        <Icon class="mr-2 h-4 w-4" name="iconoir:plus" />
                        {{ t("dashboard.addAccount") }}
                    </Button>
                </div>

                <div v-if="isLoading" class="flex flex-col gap-6 md:min-h-0 md:flex-1">
                    <Skeleton class="h-100 w-full shrink-0" />
                    <div class="space-y-4 md:flex-1 md:overflow-hidden">
                        <Skeleton class="h-20 w-full" />
                        <Skeleton class="h-20 w-full" />
                        <Skeleton class="h-20 w-full" />
                    </div>
                </div>

                <div
                    v-else-if="accountStore.accounts.length === 0"
                    class="border-border/60 bg-brand-gradient-soft/30 animate-fade-in-scale relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-12 text-center">
                    <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 opacity-40">
                        <svg
                            class="absolute -top-8 -right-8 h-56 w-56 opacity-30"
                            fill="currentColor"
                            viewBox="0 0 100 100"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                class="text-primary"
                                d="M18 12 Q14 12 14 18 L14 82 Q14 88 20 88 L28 88 Q34 88 34 82 L34 58 L54 58 Q60 58 60 52 L60 46 Q60 40 54 40 L34 40 L34 32 L66 32 Q72 32 72 26 L72 18 Q72 12 66 12 Z" />
                        </svg>
                    </div>
                    <div
                        class="bg-card border-border/60 mb-4 flex size-16 items-center justify-center rounded-2xl border shadow-sm">
                        <Icon class="text-primary size-8" name="iconoir:wallet" />
                    </div>
                    <h3 class="font-heading text-xl font-semibold tracking-tight">
                        {{ t("dashboard.noAccountsTitle") }}
                    </h3>
                    <p class="text-muted-foreground mt-2 mb-6 max-w-md text-sm">
                        {{ t("dashboard.noAccountsDescription") }}
                    </p>
                    <Button
                        class="bg-brand-gradient hover:shadow-glow text-white shadow-md hover:brightness-110"
                        @click="openCreateModal">
                        <Icon class="mr-2 h-4 w-4" name="iconoir:plus" />
                        {{ t("dashboard.createFirstAccount") }}
                    </Button>
                </div>

                <template v-else>
                    <!-- Graph with KPI -->
                    <div
                        class="bg-card text-card-foreground border-border/60 relative shrink-0 overflow-hidden rounded-2xl border p-6 shadow-sm">
                        <div
                            aria-hidden="true"
                            class="bg-brand-gradient-soft pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full opacity-60 blur-3xl"></div>

                        <div class="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <h3 class="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                                    <span class="bg-primary/70 inline-block size-1.5 rounded-full"></span>
                                    {{ t("dashboard.totalBalance") }}
                                </h3>
                                <div
                                    class="font-heading mt-1 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
                                    {{ formatCurrency(displayedBalance) }}
                                </div>
                                <p class="text-muted-foreground mt-1 text-sm">
                                    {{ t("dashboard.acrossAccounts", {count: accountStore.accounts.length}) }}
                                </p>
                            </div>
                            <Tabs v-model="timeRange" class="w-auto">
                                <TabsList>
                                    <TabsTrigger value="7D">7D</TabsTrigger>
                                    <TabsTrigger value="1M">1M</TabsTrigger>
                                    <TabsTrigger value="3M">3M</TabsTrigger>
                                    <TabsTrigger value="6M">6M</TabsTrigger>
                                    <TabsTrigger value="1Y">1Y</TabsTrigger>
                                    <TabsTrigger value="ALL">{{ t("common.all") }}</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                        <div class="relative">
                            <div :class="graphHeightClass">
                                <ClientOnly>
                                    <ChartContainer :config="chartConfig">
                                        <VisXYContainer
                                            :data="globalEvolutionSeries"
                                            :padding="{
                                                top: 10,
                                                bottom: 10,
                                                left: 0,
                                                right: 0,
                                            }">
                                            <svg height="0" width="0">
                                                <defs>
                                                    <linearGradient id="colorBalance" x1="0" x2="0" y1="0" y2="1">
                                                        <stop :stop-color="chartColor" offset="5%" stop-opacity="0.35" />
                                                        <stop :stop-color="chartColor" offset="95%" stop-opacity="0" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>

                                            <VisArea
                                                :curveType="CurveType.MonotoneX"
                                                :opacity="1"
                                                :x="x"
                                                :y="y"
                                                color="url(#colorBalance)" />

                                            <VisLine
                                                :color="chartColor"
                                                :curveType="CurveType.MonotoneX"
                                                :lineWidth="3"
                                                :x="x"
                                                :y="y" />

                                            <VisScatter
                                                v-if="globalEvolutionSeries.length === 1"
                                                :color="chartColor"
                                                :size="6"
                                                :x="x"
                                                :y="y" />

                                            <VisAxis
                                                :gridLine="false"
                                                :numTicks="isMobile ? 3 : undefined"
                                                :tickFormat="
                                                    (d: number) =>
                                                        new Date(d).toLocaleDateString(locale.value || 'en-US', {
                                                            month: 'short',
                                                            day: 'numeric',
                                                        })
                                                "
                                                type="x" />
                                            <VisAxis
                                                v-if="!isMobile"
                                                :gridLine="false"
                                                :tickFormat="(d: number) => formatCompactCurrency(d)"
                                                type="y" />
                                            <ChartCrosshair
                                                :color="chartColor"
                                                :template="
                                                    (d: any) => `
                                            <div class='flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-sm'>
                                                <span class='text-[0.70rem] uppercase text-muted-foreground'>
                                                    ${new Date(d.date).toLocaleDateString(locale.value || 'en-US', {year: 'numeric', month: 'long', day: 'numeric'})}
                                                </span>
                                                <span class='font-bold text-muted-foreground'>
                                                    ${formatCurrency(d.balance)}
                                                </span>
                                            </div>
                                        `
                                                " />
                                            <ChartTooltip :customComponent="ChartTooltipContent" />
                                        </VisXYContainer>
                                    </ChartContainer>
                                    <template #fallback>
                                        <div class="flex h-full items-center justify-center">
                                            <Skeleton class="h-full w-full" />
                                        </div>
                                    </template>
                                </ClientOnly>
                            </div>
                        </div>
                    </div>

                    <!-- Accounts List Grouped by Category -->
                    <component
                        :is="!isMobile ? ScrollArea : 'div'"
                        :class="!isMobile ? 'md:min-h-0 md:flex-1 md:pr-4' : ''">
                        <div class="stagger-children space-y-4 pb-4">
                            <Collapsible
                                v-for="(category, idx) in categoryStats"
                                :key="category.type"
                                :open="!collapsedCategories[category.type]"
                                :style="{'--stagger-index': idx}"
                                class="bg-card text-card-foreground border-border/60 overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-md"
                                @update:open="(val) => (collapsedCategories[category.type] = !val)">
                                <CollapsibleTrigger
                                    class="hover:bg-muted/50 flex w-full items-center justify-between p-4 transition-colors">
                                    <div class="flex items-center gap-3">
                                        <Icon
                                            :name="
                                                !collapsedCategories[category.type]
                                                    ? 'iconoir:nav-arrow-down'
                                                    : 'iconoir:nav-arrow-right'
                                            "
                                            class="text-muted-foreground h-5 w-5 transition-transform duration-200" />
                                        <h3 class="font-heading flex items-center gap-2 text-lg font-semibold">
                                            <Icon class="text-accent h-5 w-5" name="iconoir:folder" />
                                            {{ t(`accounts.types.${category.type.toLowerCase()}`) }}
                                        </h3>
                                    </div>
                                    <div class="flex items-center gap-4 text-sm">
                                        <span class="text-muted-foreground hidden tabular-nums sm:inline">
                                            {{ t("dashboard.percentOfTotal", {value: category.percentage.toFixed(1)}) }}
                                        </span>
                                        <span class="font-heading text-base font-semibold tabular-nums">
                                            {{ formatCurrency(category.value) }}
                                        </span>
                                    </div>
                                </CollapsibleTrigger>

                                <CollapsibleContent>
                                    <div class="flex flex-col border-t">
                                        <div
                                            v-for="account in category.accounts"
                                            :key="account.id"
                                            class="hover:bg-muted/40 flex cursor-pointer items-center justify-between border-b p-4 transition-colors last:border-b-0"
                                            @click="goToDetails(account.id)">
                                            <div class="flex flex-col">
                                                <span class="font-medium">{{ account.name }}</span>
                                                <span class="text-muted-foreground mt-1 text-xs tabular-nums">
                                                    {{
                                                        t("dashboard.percentOfCategory", {
                                                            value: account.percentageOfCategory.toFixed(1),
                                                        })
                                                    }}
                                                </span>
                                            </div>

                                            <div class="flex items-center gap-4">
                                                <span class="font-semibold tabular-nums">{{
                                                    formatCurrency(account.balance)
                                                }}</span>

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            class="-mr-2 h-8 w-8"
                                                            size="icon"
                                                            variant="ghost"
                                                            @click.stop>
                                                            <Icon class="h-4 w-4" name="iconoir:more-horiz" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" @click.stop>
                                                        <DropdownMenuItem @click.stop="openEditModal(account)">
                                                            <Icon class="mr-2 h-4 w-4" name="iconoir:edit-pencil" />
                                                            {{ t("common.edit") }}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            class="text-destructive focus:text-destructive"
                                                            @click.stop="confirmDelete(account)">
                                                            <Icon class="mr-2 h-4 w-4" name="iconoir:trash" />
                                                            {{ t("common.delete") }}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        </div>
                    </component>
                </template>

                <!-- Modals -->
                <AccountFormModal v-model:open="isFormModalOpen" :account="accountToEdit" @saved="onFormSaved" />

                <AlertDialog :open="isDeleteDialogOpen" @update:open="isDeleteDialogOpen = $event">
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{{ t("common.areYouSure") }}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {{ t("dashboard.deleteAccountDescription", {name: accountToDelete?.name ?? ""}) }}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                            <AlertDialogAction
                                class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                @click="executeDelete">
                                {{ t("common.delete") }}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    </div>
</template>
