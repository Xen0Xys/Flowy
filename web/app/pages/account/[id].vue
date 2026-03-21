<script setup lang="ts">
import {ref, computed, onMounted, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {useMediaQuery} from "@vueuse/core";
import {useAccountStore} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import {useTransactionStore} from "~/stores/transaction.store";
import {buildDateRange} from "~/utils/accounts";
import type {TimeRange} from "~/utils/accounts";
import {toCurrency} from "~/lib/currency";
import type {Account} from "~/stores/account.store";
import type {Transaction} from "~/stores/transaction.store";
import AccountFormModal from "~/components/accounts/AccountFormModal.vue";
import TransactionTable from "~/components/transactions/TransactionTable.vue";
import TransactionFormModal from "~/components/transactions/TransactionFormModal.vue";

import {Button} from "~/components/ui/button";
import {Skeleton} from "~/components/ui/skeleton";
import {Badge} from "~/components/ui/badge";
import {ScrollArea} from "~/components/ui/scroll-area";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";
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
import {ChartContainer, ChartTooltip, ChartTooltipContent, ChartCrosshair} from "~/components/ui/chart";
import {VisXYContainer, VisLine, VisAxis, VisScatter, VisArea} from "@unovis/vue";
import {CurveType} from "@unovis/ts";

const route = useRoute();
const router = useRouter();
const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const transactionStore = useTransactionStore();
const isMobile = useMediaQuery("(max-width: 768px)");

const accountId = route.params.id as string;
const isLoading = ref(true);

const isFormModalOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const timeRange = ref<TimeRange>("1M");

const isTransactionModalOpen = ref(false);
const selectedTransaction = ref<Transaction | null>(null);

const account = computed(() => accountStore.currentAccount);
const evolutionSeries = computed(() => accountStore.currentAccountEvolution);
const transactions = computed(() => transactionStore.currentAccountTransactions);

const chartColor = computed(() => {
    const series = evolutionSeries.value;
    if (!series || series.length === 0) return "#94a3b8"; // slate-400
    const startValue = series[0].balance;
    const endValue = series[series.length - 1].balance;

    if (endValue > startValue) return "#10b981"; // emerald-500
    if (endValue < startValue) return "#ef4444"; // red-500
    return "#94a3b8"; // slate-400
});

const chartConfig = {
    balance: {label: "Balance", color: "hsl(var(--primary))"},
};

const x = (d: {date: string}) => new Date(d.date).getTime();
const y = (d: {balance: number}) => d.balance;

const loadData = async () => {
    isLoading.value = true;
    try {
        await Promise.all([
            accountStore.fetchAccountById(accountId),
            familyStore.fetchFamily(),
            transactionStore.fetchTransactionsByAccountId(accountId),
        ]);
        await loadChartData();
    } catch (err) {
        console.error(err);
        router.push("/");
    } finally {
        isLoading.value = false;
    }
};

const loadChartData = async () => {
    const {startDate, endDate} = buildDateRange(timeRange.value);
    await accountStore.fetchAccountBalanceEvolution(accountId, startDate, endDate);
};

onMounted(loadData);

watch(timeRange, () => {
    loadChartData();
});

const goBack = () => {
    router.push("/");
};

const openEditModal = () => {
    isFormModalOpen.value = true;
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

const handleNewTransactionClick = () => {
    selectedTransaction.value = null;
    isTransactionModalOpen.value = true;
};

const handleTransactionClick = (transaction: Transaction) => {
    selectedTransaction.value = transaction;
    isTransactionModalOpen.value = true;
};

const onTransactionSaved = () => {
    loadData();
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
    return new Date(dateString).toLocaleDateString("en-US", {
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
    <div class="flex flex-col gap-6 md:h-[calc(100dvh-4rem-1.5rem)]">
        <!-- Header -->
        <div class="flex shrink-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div class="flex items-start gap-4 md:items-center">
                <Button variant="outline" size="icon" @click="goBack" class="mt-1 shrink-0 md:mt-0">
                    <Icon name="iconoir:arrow-left" class="h-4 w-4" />
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
                            <Badge variant="secondary">{{ account.type }}</Badge>
                            <span v-if="account.updatedAt" class="text-muted-foreground text-xs">
                                Updated on {{ formatDate(account.updatedAt) }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex w-full items-center gap-2 md:w-auto" v-if="!isLoading && account">
                <Button variant="outline" @click="openEditModal" class="flex-1 md:flex-none">
                    <Icon name="iconoir:edit-pencil" class="mr-2 h-4 w-4" />
                    Edit
                </Button>
                <Button variant="destructive" @click="confirmDelete" class="flex-1 md:flex-none">
                    <Icon name="iconoir:trash" class="mr-2 h-4 w-4" />
                    Delete
                </Button>
            </div>
        </div>

        <div v-if="isLoading" class="flex flex-col gap-6 md:min-h-0 md:flex-1">
            <Skeleton class="h-[400px] w-full shrink-0" />
            <div class="space-y-4 md:flex-1 md:overflow-hidden">
                <Skeleton class="h-20 w-full" />
                <Skeleton class="h-20 w-full" />
                <Skeleton class="h-20 w-full" />
            </div>
        </div>

        <template v-else-if="account">
            <!-- Graph with KPI -->
            <div class="bg-card text-card-foreground shrink-0 rounded-xl border p-6 shadow-sm">
                <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h3 class="text-muted-foreground text-sm font-medium">Current Balance</h3>
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
                            <TabsTrigger value="ALL">All</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
                <div>
                    <div class="-mx-6 mt-6 h-[300px] md:mx-0">
                        <ClientOnly>
                            <ChartContainer :config="chartConfig">
                                <VisXYContainer
                                    :data="evolutionSeries"
                                    :padding="{
                                        top: 10,
                                        bottom: 10,
                                        left: 0,
                                        right: 0,
                                    }">
                                    <svg width="0" height="0">
                                        <defs>
                                            <linearGradient id="colorBalanceDetails" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" :stop-color="chartColor" stop-opacity="0.3" />
                                                <stop offset="95%" :stop-color="chartColor" stop-opacity="0" />
                                            </linearGradient>
                                        </defs>
                                    </svg>

                                    <VisArea
                                        :x="x"
                                        :y="y"
                                        :curveType="CurveType.MonotoneX"
                                        color="url(#colorBalanceDetails)"
                                        :opacity="1" />

                                    <VisLine
                                        :x="x"
                                        :y="y"
                                        :curveType="CurveType.MonotoneX"
                                        :color="chartColor"
                                        :lineWidth="3" />

                                    <VisScatter
                                        v-if="evolutionSeries.length === 1"
                                        :x="x"
                                        :y="y"
                                        :color="chartColor"
                                        :size="6" />

                                    <VisAxis
                                        type="x"
                                        :gridLine="false"
                                        :numTicks="isMobile ? 3 : undefined"
                                        :tickFormat="
                                            (d: number) =>
                                                new Date(d).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                })
                                        " />
                                    <VisAxis
                                        v-if="!isMobile"
                                        type="y"
                                        :gridLine="false"
                                        :tickFormat="(d: number) => formatCompactCurrency(d)" />
                                    <ChartCrosshair
                                        :color="chartColor"
                                        :template="
                                            (d: any) => `
                                            <div class='flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-sm'>
                                                <span class='text-[0.70rem] uppercase text-muted-foreground'>
                                                    ${new Date(d.date).toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'})}
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

            <!-- Transactions -->
            <div
                class="bg-card text-card-foreground flex flex-col rounded-xl border p-6 shadow-sm md:mb-6 md:min-h-0 md:flex-1">
                <div class="mb-4 flex shrink-0 items-center justify-between">
                    <h3 class="text-lg leading-none font-semibold tracking-tight">Transactions</h3>
                    <Button @click="handleNewTransactionClick" size="sm">
                        <Icon name="iconoir:plus" class="h-4 w-4" />
                        New Transaction
                    </Button>
                </div>
                <component
                    :is="!isMobile ? ScrollArea : 'div'"
                    :scrollbar-class="!isMobile ? 'pt-[41px]' : ''"
                    :class="
                        !isMobile
                            ? 'overflow-hidden rounded-md border md:min-h-0 md:flex-1'
                            : 'overflow-hidden rounded-md border'
                    ">
                    <TransactionTable :transactions="transactions" @row-click="handleTransactionClick" />
                </component>
            </div>
        </template>

        <!-- Modals -->
        <AccountFormModal v-model:open="isFormModalOpen" :account="account" @saved="onFormSaved" />

        <TransactionFormModal
            v-model:open="isTransactionModalOpen"
            :transaction="selectedTransaction"
            :account-id="accountId"
            @saved="onTransactionSaved" />

        <AlertDialog :open="isDeleteDialogOpen" @update:open="isDeleteDialogOpen = $event">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. The account "{{ account?.name }}" and all its associated data will
                        be deleted.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        @click="executeDelete">
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
</template>
