<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useMediaQuery, useStorage} from "@vueuse/core";
import {useRouter} from "vue-router";
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
    balance: {label: t("dashboard.balance"), color: "#2563eb"},
}));

const x = (d: {date: string}) => new Date(d.date).getTime();
const y = (d: {balance: number}) => d.balance;

const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const userStore = useUserStore();
const router = useRouter();

const isMobile = useMediaQuery("(max-width: 768px)");

const isLoading = ref(true);
const isCreating = ref(false);
const accountToEdit = ref<Account | null>(null);
const isFormModalOpen = ref(false);

const accountToDelete = ref<Account | null>(null);
const isDeleteDialogOpen = ref(false);

const timeRange = ref<TimeRange>("1M");
const globalEvolutionSeries = ref<{date: string; balance: number}[]>([]);

const collapsedCategories = useStorage<Record<string, boolean>>("flowy_collapsed_categories", {});

const chartColor = computed(() => {
    const series = globalEvolutionSeries.value;
    if (!series || series.length === 0) return "#94a3b8"; // slate-400
    const startValue = series[0].balance;
    const endValue = series[series.length - 1].balance;

    if (endValue > startValue) return "#10b981"; // emerald-500
    if (endValue < startValue) return "#ef4444"; // red-500
    return "#94a3b8"; // slate-400
});

const totalBalance = computed(() => computeTotalBalance(accountStore.accounts));
const groupedAccounts = computed(() => groupAccountsByType(accountStore.accounts));
const categoryStats = computed(() => computeCategoryStats(groupedAccounts.value));

const loadData = async () => {
    isLoading.value = true;
    try {
        await Promise.all([accountStore.fetchAccounts(), familyStore.fetchFamily()]);
        await loadChartData();
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
            <div class="flex flex-col gap-6 md:h-[calc(100dvh-4rem-1.5rem)]">
                <!-- Header -->
                <div class="flex shrink-0 items-center justify-between">
                    <div class="flex items-center gap-3">
                        <Icon class="icon-lg text-amber-500" name="iconoir:bank" />
                        <div>
                            <h1 class="text-2xl font-bold tracking-tight">
                                {{ t("dashboard.welcome", {name: userStore.user?.username ?? t("common.user")}) }}
                            </h1>
                            <p class="text-muted-foreground text-sm">{{ t("dashboard.subtitle") }}</p>
                        </div>
                    </div>
                    <Button @click="openCreateModal">
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
                    class="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
                    <Icon class="text-muted-foreground mb-4 h-12 w-12" name="iconoir:wallet" />
                    <h3 class="text-lg font-medium">{{ t("dashboard.noAccountsTitle") }}</h3>
                    <p class="text-muted-foreground mt-1 mb-4">
                        {{ t("dashboard.noAccountsDescription") }}
                    </p>
                    <Button @click="openCreateModal">{{ t("dashboard.createFirstAccount") }}</Button>
                </div>

                <template v-else>
                    <!-- Graph with KPI -->
                    <div class="bg-card text-card-foreground shrink-0 rounded-xl border p-6 shadow-sm">
                        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <h3 class="text-muted-foreground text-sm font-medium">
                                    {{ t("dashboard.totalBalance") }}
                                </h3>
                                <div class="mt-1 text-3xl font-bold">
                                    {{ formatCurrency(totalBalance) }}
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
                        <div>
                            <div class="-mx-6 mt-6 h-75 md:mx-0">
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
                                            <!-- Gradient pour la zone sous la courbe -->
                                            <svg height="0" width="0">
                                                <defs>
                                                    <linearGradient id="colorBalance" x1="0" x2="0" y1="0" y2="1">
                                                        <stop :stop-color="chartColor" offset="5%" stop-opacity="0.3" />
                                                        <stop :stop-color="chartColor" offset="95%" stop-opacity="0" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>

                                            <!-- Zone remplie -->
                                            <VisArea
                                                :curveType="CurveType.MonotoneX"
                                                :opacity="1"
                                                :x="x"
                                                :y="y"
                                                color="url(#colorBalance)" />

                                            <!-- Ligne principale courbée -->
                                            <VisLine
                                                :color="chartColor"
                                                :curveType="CurveType.MonotoneX"
                                                :lineWidth="3"
                                                :x="x"
                                                :y="y" />

                                            <!-- Points sur la courbe (désactivés sauf au survol géré par le crosshair,
                                         mais on laisse un scatter léger si on veut forcer un point sur les single data) -->
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
                        <div class="space-y-4 pb-4">
                            <Collapsible
                                v-for="category in categoryStats"
                                :key="category.type"
                                :open="!collapsedCategories[category.type]"
                                class="bg-card text-card-foreground overflow-hidden rounded-xl border shadow-sm"
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
                                            class="text-muted-foreground h-5 w-5 transition-transform" />
                                        <h3 class="flex items-center gap-2 text-lg font-semibold">
                                            <Icon class="text-muted-foreground h-5 w-5" name="iconoir:folder" />
                                            {{ t(`accounts.types.${category.type.toLowerCase()}`) }}
                                        </h3>
                                    </div>
                                    <div class="flex items-center gap-4 text-sm">
                                        <span class="text-muted-foreground hidden sm:inline">{{
                                            t("dashboard.percentOfTotal", {value: category.percentage.toFixed(1)})
                                        }}</span>
                                        <span class="text-base font-bold">{{ formatCurrency(category.value) }}</span>
                                    </div>
                                </CollapsibleTrigger>

                                <CollapsibleContent>
                                    <div class="flex flex-col border-t">
                                        <div
                                            v-for="account in category.accounts"
                                            :key="account.id"
                                            class="hover:bg-muted/50 flex cursor-pointer items-center justify-between border-b p-4 transition-colors last:border-b-0"
                                            @click="goToDetails(account.id)">
                                            <div class="flex flex-col">
                                                <span class="font-medium">{{ account.name }}</span>
                                                <span class="text-muted-foreground mt-1 text-xs">
                                                    {{
                                                        t("dashboard.percentOfCategory", {
                                                            value: account.percentageOfCategory.toFixed(1),
                                                        })
                                                    }}
                                                </span>
                                            </div>

                                            <div class="flex items-center gap-4">
                                                <span class="font-bold">{{ formatCurrency(account.balance) }}</span>

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
