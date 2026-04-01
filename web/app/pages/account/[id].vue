<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useRoute, useRouter} from "vue-router";
import {useMediaQuery} from "@vueuse/core";
import {useAccountStore} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import type {TimeRange} from "~/utils/accounts";
import {buildDateRange} from "~/utils/accounts";
import {toCurrency} from "~/lib/currency";
import AccountFormModal from "~/components/accounts/AccountFormModal.vue";
import TransactionListWidget from "~/components/transactions/TransactionListWidget.vue";

import {Button} from "~/components/ui/button";
import {Skeleton} from "~/components/ui/skeleton";
import {Badge} from "~/components/ui/badge";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Input} from "~/components/ui/input";
import {Label} from "~/components/ui/label";
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

const route = useRoute();
const router = useRouter();
const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const transactionStore = useTransactionStore();
const isMobile = useMediaQuery("(max-width: 768px)");
const {locale, t, te} = useI18n();

const accountId = route.params.id as string;
const isLoading = ref(true);

const isFormModalOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const isSetBalanceDialogOpen = ref(false);
const isSettingBalance = ref(false);
const targetBalance = ref(0);
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

const chartColor = computed(() => {
    const series = evolutionSeries.value;
    if (!series || series.length === 0) return "#94a3b8"; // slate-400
    const startValue = series[0].balance;
    const endValue = series[series.length - 1].balance;

    if (endValue > startValue) return "#10b981"; // emerald-500
    if (endValue < startValue) return "#ef4444"; // red-500
    return "#94a3b8"; // slate-400
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
    isSetBalanceDialogOpen.value = true;
};

const confirmDelete = () => {
    isDeleteDialogOpen.value = true;
};

const executeDelete = async () => {
    await accountStore.deleteAccount(accountId);
    isDeleteDialogOpen.value = false;
    router.push("/");
};

const onFormSaved = () => {
    loadData();
};

const onTransactionSaved = () => {
    loadData();
};

const submitSetBalance = async () => {
    if (!account.value || Number.isNaN(targetBalance.value)) return;

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
    if (value < 0) return "text-red-500";
    if (value > 0) return "text-emerald-600";
    return "text-foreground";
};

const transactionKey = (transaction: Transaction) => transaction.id;
</script>

<template>
    <div class="w-full overflow-hidden">
        <div class="mx-auto max-w-7xl">
            <div class="flex flex-col gap-6 md:h-[calc(100dvh-4rem-1.5rem)]">
                <!-- Header -->
                <div class="flex shrink-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div class="flex items-start gap-4 md:items-center">
                        <Button class="mt-1 shrink-0 md:mt-0" size="icon" variant="outline" @click="goBack">
                            <Icon class="h-4 w-4" name="iconoir:arrow-left" />
                        </Button>

                        <div class="flex-1">
                            <div v-if="isLoading" class="flex flex-col gap-2">
                                <Skeleton class="h-8 w-48" />
                                <Skeleton class="h-4 w-24" />
                            </div>
                            <div v-else-if="account">
                                <h1 class="text-2xl font-bold tracking-tight md:text-3xl">
                                    {{ account.name }}
                                </h1>
                                <div class="mt-1 flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">{{ accountTypeLabel }}</Badge>
                                    <span v-if="account.updatedAt" class="text-muted-foreground text-xs">
                                        {{ t("account.updatedOn", {date: formatDate(account.updatedAt)}) }}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="!isLoading && account" class="flex w-full flex-wrap items-center gap-2 md:w-auto">
                        <Button class="flex-1 md:flex-none" variant="secondary" @click="openSetBalanceDialog">
                            <Icon class="h-4 w-4" name="iconoir:coins-swap" />
                            {{ t("account.setBalance") }}
                        </Button>
                        <Button class="flex-1 md:flex-none" variant="outline" @click="openEditModal">
                            <Icon class="h-4 w-4" name="iconoir:edit-pencil" />
                            {{ t("common.edit") }}
                        </Button>
                        <Button class="flex-1 md:flex-none" variant="destructive" @click="confirmDelete">
                            <Icon class="h-4 w-4" name="iconoir:trash" />
                            {{ t("common.delete") }}
                        </Button>
                    </div>
                </div>

                <!-- Graph with KPI -->
                <div class="bg-card text-card-foreground shrink-0 rounded-xl border p-6 shadow-sm">
                    <div v-if="isLoading" class="flex flex-col gap-4">
                        <Skeleton class="h-6 w-28" />
                        <Skeleton class="h-8 w-32" />
                        <Skeleton class="h-75 w-full" />
                    </div>
                    <template v-else-if="account">
                        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <h3 class="text-muted-foreground text-sm font-medium">
                                    {{ t("account.currentBalance") }}
                                </h3>
                                <div class="mt-1 text-3xl font-bold">
                                    {{ formatCurrency(account.balance) }}
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
                            <div class="-mx-6 mt-6 h-[300px] md:mx-0">
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

                        <form class="space-y-4 py-4" @submit.prevent="submitSetBalance">
                            <div class="space-y-2">
                                <Label for="target-balance">{{ t("account.targetBalance") }}</Label>
                                <Input
                                    id="target-balance"
                                    v-model.number="targetBalance"
                                    required
                                    step="0.01"
                                    type="number" />
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" @click="isSetBalanceDialogOpen = false">
                                    {{ t("common.cancel") }}
                                </Button>
                                <Button :disabled="isSettingBalance" type="submit">
                                    {{ isSettingBalance ? t("common.saving") : t("account.saveBalance") }}
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
