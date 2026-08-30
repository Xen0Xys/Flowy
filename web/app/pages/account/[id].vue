<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useRoute, useRouter} from "vue-router";
import {useCssVar, useMediaQuery} from "@vueuse/core";
import {useAccountStore} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import type {TimeRange} from "~/utils/accounts";
import {buildDateRange} from "~/utils/accounts";
import {toCurrency} from "~/lib/currency";
import AccountFormModal from "~/components/accounts/AccountFormModal.vue";
import TransactionListWidget from "~/components/transactions/TransactionListWidget.vue";

import {Button} from "~/components/ui/button";
import {Skeleton} from "~/components/ui/skeleton";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {Label} from "~/components/ui/label";
import MoneyInput from "~/components/common/MoneyInput.vue";
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
import {ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent} from "~/components/ui/chart";
import {VisArea, VisAxis, VisLine, VisScatter, VisXYContainer} from "@unovis/vue";
import {CurveType} from "@unovis/ts";
import type {Transaction} from "~/stores/transaction.store";
import {useTransactionStore} from "~/stores/transaction.store";
import {cn} from "~/lib/utils";

const route = useRoute();
const router = useRouter();
const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const transactionStore = useTransactionStore();
const isMobile = useMediaQuery("(max-width: 768px)");
const isCompactHeight = useMediaQuery("(max-height: 1080px)");
const isVeryCompactHeight = useMediaQuery("(max-height: 920px)");
const {locale, t, te} = useI18n();

const accountId = route.params.id as string;
const isLoading = ref(true);

const isFormModalOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const isSetBalanceDialogOpen = ref(false);
const isSettingBalance = ref(false);
const targetBalance = ref(0);
const targetBalanceTouched = ref(false);
const timeRange = ref<TimeRange>("1M");
const transactionListWidgetRef = ref<InstanceType<typeof TransactionListWidget> | null>(null);

const account = computed(() => accountStore.currentAccount);
const evolutionSeries = computed(() => accountStore.currentAccountEvolution);
const accountTypeLabel = computed(() => {
    const type = account.value?.type;
    if (!type) return "";

    const normalizedType = type.toLowerCase();
    const key = `accounts.types.${normalizedType}`;
    return te(key) ? t(key) : type;
});

const successVar = useCssVar("--success");
const destructiveVar = useCssVar("--destructive");
const mutedFgVar = useCssVar("--muted-foreground");

const chartColor = computed(() => {
    const series = evolutionSeries.value;
    const fallback = mutedFgVar.value?.trim() || "oklch(0.5 0.02 250)";
    if (!series || series.length === 0) return fallback;
    const startValue = series[0].balance;
    const endValue = series[series.length - 1].balance;

    if (endValue > startValue) return successVar.value?.trim() || fallback;
    if (endValue < startValue) return destructiveVar.value?.trim() || fallback;
    return fallback;
});

const chartConfig = computed(() => ({
    balance: {label: t("dashboard.balance"), color: "hsl(var(--primary))"},
}));

const x = (d: {date: string}) => new Date(d.date).getTime();
const y = (d: {balance: number}) => d.balance;

const loadData = async () => {
    isLoading.value = true;
    const startTime = Date.now();
    const minLoadingTime = 150; // Minimum time to show skeleton (ms)

    try {
        await Promise.all([accountStore.fetchAccountById(accountId), familyStore.fetchFamily()]);
        await loadChartData();
        animateBalance(0, account.value?.balance ?? 0);
    } catch (err) {
        console.error(err);
        router.push("/");
    } finally {
        // Ensure skeleton is visible for at least minLoadingTime
        const elapsed = Date.now() - startTime;
        if (elapsed < minLoadingTime) {
            await new Promise((resolve) => setTimeout(resolve, minLoadingTime - elapsed));
        }
        isLoading.value = false;
    }
};

const loadChartData = async () => {
    const {startDate, endDate} = buildDateRange(timeRange.value);
    await accountStore.fetchAccountBalanceEvolution(accountId, startDate, endDate);
};

onMounted(() => {
    requestAnimationFrame(() => {
        loadData();
    });
});

watch(timeRange, () => {
    loadChartData();
});

const goBack = () => {
    router.push("/");
};

const openEditModal = () => {
    isFormModalOpen.value = true;
};

const openSetBalanceDialog = () => {
    if (!account.value) return;
    targetBalance.value = account.value.balance;
    targetBalanceTouched.value = false;
    isSetBalanceDialogOpen.value = true;
};

const rebalanceDelta = computed(() => {
    if (!account.value) return 0;
    return Number(((targetBalance.value ?? 0) - account.value.balance).toFixed(2));
});

const hasRebalanceChange = computed(() => !Number.isNaN(targetBalance.value) && rebalanceDelta.value !== 0);

const deltaClass = computed(() => {
    if (rebalanceDelta.value > 0) return "text-success";
    if (rebalanceDelta.value < 0) return "text-destructive";
    return "text-muted-foreground";
});

const deltaLabel = computed(() => {
    if (!hasRebalanceChange.value) return t("account.noChange");
    const sign = rebalanceDelta.value > 0 ? "+" : "";
    return `${sign}${formatCurrency(rebalanceDelta.value)}`;
});

const confirmDelete = () => {
    isDeleteDialogOpen.value = true;
};

const executeDelete = async () => {
    await accountStore.deleteAccount(accountId);
    isDeleteDialogOpen.value = false;
    router.push("/");
};

const onFormSaved = () => {
    transactionListWidgetRef.value?.refreshTransactions();
    loadData();
};

const onTransactionSaved = () => {
    loadData();
};

const submitSetBalance = async () => {
    if (!account.value || Number.isNaN(targetBalance.value)) return;
    if (!hasRebalanceChange.value) {
        isSetBalanceDialogOpen.value = false;
        return;
    }

    isSettingBalance.value = true;
    try {
        await accountStore.updateAccount(account.value.id, {
            balance: targetBalance.value,
        });
        isSetBalanceDialogOpen.value = false;
        transactionListWidgetRef.value?.refreshTransactions();
        await loadData();
    } catch (err) {
        console.error(err);
    } finally {
        isSettingBalance.value = false;
    }
};

const formatCurrency = (value: number) => {
    const currency = familyStore.family?.currency || "USD";
    return toCurrency(value, currency);
};

const formatCompactCurrency = (value: number) => {
    const currency = familyStore.family?.currency || "USD";
    return toCurrency(value, currency);
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale.value || "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
};

const amountClass = (value: number) => {
    if (value < 0) return "text-destructive";
    if (value > 0) return "text-success";
    return "text-foreground";
};

const transactionKey = (transaction: Transaction) => transaction.id;

const pageStackClass = computed(() =>
    cn(
        "flex min-h-0 flex-col md:h-[calc(100dvh-4rem-1.5rem)]",
        isVeryCompactHeight.value ? "gap-2 md:gap-3" : isCompactHeight.value ? "gap-3 md:gap-4" : "gap-4 md:gap-6",
    ),
);

const headerClass = computed(() =>
    cn(
        "flex shrink-0 flex-col md:flex-row md:items-center md:justify-between",
        isVeryCompactHeight.value ? "gap-2 md:gap-3" : "gap-4",
    ),
);

const graphCardClass = computed(() =>
    cn(
        "bg-card text-card-foreground shrink-0 rounded-xl border shadow-sm",
        isVeryCompactHeight.value ? "p-3 md:p-4" : isCompactHeight.value ? "p-4 md:p-5" : "p-6",
    ),
);

const graphHeaderClass = computed(() =>
    cn("flex flex-col md:flex-row md:items-start md:justify-between", isVeryCompactHeight.value ? "gap-3" : "gap-4"),
);

const graphAmountClass = computed(() =>
    cn(
        "font-heading mt-1 font-semibold tracking-tight tabular-nums",
        isVeryCompactHeight.value ? "text-2xl" : "text-3xl",
    ),
);

// Count-up on balance
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
        const eased = 1 - Math.pow(1 - progress, 3);
        displayedBalance.value = from + (to - from) * eased;
        if (progress < 1) rafHandle = requestAnimationFrame(step);
        else rafHandle = null;
    };
    rafHandle = requestAnimationFrame(step);
}
watch(
    () => account.value?.balance ?? 0,
    (v, prev) => animateBalance(prev ?? 0, v),
    {immediate: false},
);

const graphHeightClass = computed(() =>
    cn("md:mx-0", {
        "-mx-3 mt-2 h-[150px] md:h-[170px]": isVeryCompactHeight.value,
        "-mx-4 mt-3 h-[180px] md:h-[210px]": !isVeryCompactHeight.value && isCompactHeight.value,
        "-mx-6 mt-6 h-[260px] md:h-[300px]": !isVeryCompactHeight.value && !isCompactHeight.value,
    }),
);
</script>

<template>
    <div class="w-full">
        <div class="mx-auto max-w-7xl">
            <div :class="pageStackClass">
                <!-- Header -->
                <div :class="headerClass">
                    <div class="flex items-start gap-3">
                        <Button class="mt-1 shrink-0 self-center md:mt-0" size="icon" variant="outline" @click="goBack">
                            <Icon class="h-4 w-4" name="iconoir:arrow-left" />
                        </Button>

                        <div class="flex items-center gap-3">
                            <Icon class="icon-lg text-primary shrink-0" name="iconoir:wallet" />
                            <div v-if="isLoading" class="flex flex-col gap-2">
                                <Skeleton class="h-8 w-48" />
                                <Skeleton class="h-4 w-24" />
                            </div>
                            <div v-else-if="account" class="min-w-0">
                                <h1 class="font-heading truncate text-2xl font-semibold tracking-tight">
                                    {{ account.name }}
                                </h1>
                                <p class="text-muted-foreground text-sm">
                                    <template v-if="account.updatedAt">
                                        {{ accountTypeLabel }} •
                                        {{ t("account.updatedOn", {date: formatDate(account.updatedAt)}) }}
                                    </template>
                                    <template v-else>
                                        {{ accountTypeLabel }}
                                    </template>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div v-if="!isLoading && account" class="flex w-full items-center gap-2 md:w-auto">
                        <Button class="flex-1 md:flex-none" variant="secondary" @click="openSetBalanceDialog">
                            <Icon class="h-4 w-4" name="iconoir:coins-swap" />
                            {{ t("account.setBalance") }}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger as-child>
                                <Button class="shrink-0" size="icon" type="button" variant="outline">
                                    <Icon class="h-4 w-4" name="iconoir:more-vert" />
                                    <span class="sr-only">{{ t("common.moreActions") }}</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" class="w-44">
                                <DropdownMenuItem @select="openEditModal">
                                    <Icon class="h-4 w-4" name="iconoir:edit-pencil" />
                                    {{ t("common.edit") }}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    class="text-destructive focus:text-destructive"
                                    @select="confirmDelete">
                                    <Icon class="h-4 w-4" name="iconoir:trash" />
                                    {{ t("common.delete") }}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <!-- Graph with KPI -->
                <div :class="graphCardClass">
                    <div v-if="isLoading" class="flex flex-col gap-4">
                        <Skeleton class="h-6 w-28" />
                        <Skeleton class="h-8 w-32" />
                        <Skeleton class="h-75 w-full" />
                    </div>
                    <template v-else-if="account">
                        <div :class="graphHeaderClass">
                            <div>
                                <h3 class="text-muted-foreground text-sm font-medium">
                                    {{ t("account.currentBalance") }}
                                </h3>
                                <div :class="graphAmountClass">
                                    {{ formatCurrency(displayedBalance) }}
                                </div>
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
                            <div :class="graphHeightClass">
                                <ClientOnly>
                                    <div
                                        v-if="evolutionSeries.length === 0"
                                        class="flex h-full items-center justify-center">
                                        <p class="text-muted-foreground text-sm">{{ t("account.noData") }}</p>
                                    </div>
                                    <ChartContainer v-else :config="chartConfig">
                                        <VisXYContainer
                                            :data="evolutionSeries"
                                            :padding="{
                                                top: 10,
                                                bottom: 10,
                                                left: 0,
                                                right: 0,
                                            }">
                                            <svg height="0" width="0">
                                                <defs>
                                                    <linearGradient id="colorBalanceDetails" x1="0" x2="0" y1="0" y2="1">
                                                        <stop :stop-color="chartColor" offset="5%" stop-opacity="0.3" />
                                                        <stop :stop-color="chartColor" offset="95%" stop-opacity="0" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>

                                            <VisArea
                                                :curveType="CurveType.MonotoneX"
                                                :opacity="1"
                                                :x="x"
                                                :y="y"
                                                color="url(#colorBalanceDetails)" />

                                            <VisLine
                                                :color="chartColor"
                                                :curveType="CurveType.MonotoneX"
                                                :lineWidth="3"
                                                :x="x"
                                                :y="y" />

                                            <VisScatter
                                                v-if="evolutionSeries.length === 1"
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
                    </template>
                </div>

                <!-- Transactions -->
                <TransactionListWidget
                    ref="transactionListWidgetRef"
                    :account-id="accountId"
                    :show-view-all="true"
                    view-all-link="/transactions"
                    class="min-h-0 flex-1"
                    @saved="onTransactionSaved" />

                <!-- Modals -->
                <AccountFormModal v-model:open="isFormModalOpen" :account="account" @saved="onFormSaved" />

                <Dialog :open="isSetBalanceDialogOpen" @update:open="isSetBalanceDialogOpen = $event">
                    <DialogContent class="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>{{ t("account.setBalanceTitle") }}</DialogTitle>
                            <DialogDescription>
                                {{ t("account.setBalanceDescription") }}
                            </DialogDescription>
                        </DialogHeader>

                        <form class="space-y-5 py-4" novalidate @submit.prevent="submitSetBalance">
                            <fieldset :disabled="isSettingBalance" class="space-y-5">
                                <div class="space-y-2">
                                    <Label for="target-balance">{{ t("account.newBalance") }}</Label>
                                    <MoneyInput
                                        id="target-balance"
                                        v-model="targetBalance"
                                        allow-negative
                                        :currency="familyStore.family?.currency || 'USD'"
                                        :locale="locale || 'en-US'"
                                        required
                                        size="sm"
                                        @blur="targetBalanceTouched = true" />
                                </div>

                                <div class="bg-muted/40 space-y-2 rounded-lg border p-3 text-sm">
                                    <div class="flex items-center justify-between">
                                        <span class="text-muted-foreground">{{ t("account.currentBalance") }}</span>
                                        <span class="font-medium tabular-nums">
                                            {{ formatCurrency(account?.balance ?? 0) }}
                                        </span>
                                    </div>
                                    <div class="flex items-center justify-between">
                                        <span class="text-muted-foreground">
                                            {{ t("account.rebalanceTransaction") }}
                                        </span>
                                        <span class="font-semibold tabular-nums" :class="deltaClass">
                                            {{ deltaLabel }}
                                        </span>
                                    </div>
                                </div>
                            </fieldset>

                            <DialogFooter>
                                <Button type="button" variant="outline" @click="isSetBalanceDialogOpen = false">
                                    {{ t("common.cancel") }}
                                </Button>
                                <Button :disabled="isSettingBalance || !hasRebalanceChange" type="submit">
                                    <Icon v-if="isSettingBalance" class="h-4 w-4 animate-spin" name="iconoir:refresh" />
                                    {{ isSettingBalance ? t("common.saving") : t("account.updateBalance") }}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                <AlertDialog :open="isDeleteDialogOpen" @update:open="isDeleteDialogOpen = $event">
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{{ t("common.areYouSure") }}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {{ t("dashboard.deleteAccountDescription", {name: account?.name ?? ""}) }}
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
