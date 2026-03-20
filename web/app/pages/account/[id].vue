<script setup lang="ts">
import {ref, computed, onMounted, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {useMediaQuery} from "@vueuse/core";
import {useAccountStore} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import {buildDateRange} from "~/utils/accounts";
import type {TimeRange} from "~/utils/accounts";
import type {Account} from "~/stores/account.store";
import AccountFormModal from "~/components/accounts/AccountFormModal.vue";

import {Button} from "~/components/ui/button";
import {Skeleton} from "~/components/ui/skeleton";
import {Badge} from "~/components/ui/badge";
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
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartCrosshair,
} from "~/components/ui/chart";
import {
    VisXYContainer,
    VisLine,
    VisAxis,
    VisScatter,
    VisArea,
} from "@unovis/vue";
import {CurveType} from "@unovis/ts";

const route = useRoute();
const router = useRouter();
const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const isMobile = useMediaQuery("(max-width: 768px)");

const accountId = route.params.id as string;
const isLoading = ref(true);

const isFormModalOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const timeRange = ref<TimeRange>("1M");

const account = computed(() => accountStore.currentAccount);
const evolutionSeries = computed(() => accountStore.currentAccountEvolution);

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
    await accountStore.fetchAccountBalanceEvolution(
        accountId,
        startDate,
        endDate,
    );
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

const formatCurrency = (value: number) => {
    const currency = familyStore.family?.currency || "USD";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
    }).format(value);
};

const formatCompactCurrency = (value: number) => {
    const currency = familyStore.family?.currency || "USD";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
};
</script>

<template>
    <div class="space-y-6">
        <!-- Header -->
        <div class="flex items-center gap-4">
            <Button variant="outline" size="icon" @click="goBack">
                <Icon name="iconoir:arrow-left" class="h-4 w-4" />
            </Button>

            <div class="flex-1">
                <div v-if="isLoading" class="flex flex-col gap-2">
                    <Skeleton class="h-8 w-48" />
                    <Skeleton class="h-4 w-24" />
                </div>
                <div v-else-if="account">
                    <h1 class="text-3xl font-bold tracking-tight">
                        {{ account.name }}
                    </h1>
                    <div class="mt-1 flex items-center gap-2">
                        <Badge variant="secondary">{{ account.type }}</Badge>
                        <span
                            v-if="account.updatedAt"
                            class="text-muted-foreground text-xs">
                            Updated on {{ formatDate(account.updatedAt) }}
                        </span>
                    </div>
                </div>
            </div>

            <div class="flex items-center gap-2" v-if="!isLoading && account">
                <Button variant="outline" @click="openEditModal">
                    <Icon name="iconoir:edit-pencil" class="mr-2 h-4 w-4" />
                    Edit
                </Button>
                <Button variant="destructive" @click="confirmDelete">
                    <Icon name="iconoir:trash" class="mr-2 h-4 w-4" />
                    Delete
                </Button>
            </div>
        </div>

        <div v-if="isLoading" class="space-y-6">
            <Skeleton class="h-32 w-full" />
            <Skeleton class="h-64 w-full" />
            <Skeleton class="h-64 w-full" />
        </div>

        <template v-else-if="account">
            <!-- Graph with KPI -->
            <div
                class="bg-card text-card-foreground rounded-xl border p-6 shadow-sm">
                <div
                    class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h3 class="text-muted-foreground text-sm font-medium">
                            Current Balance
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
                                            <linearGradient
                                                id="colorBalanceDetails"
                                                x1="0"
                                                y1="0"
                                                x2="0"
                                                y2="1">
                                                <stop
                                                    offset="5%"
                                                    :stop-color="chartColor"
                                                    stop-opacity="0.3" />
                                                <stop
                                                    offset="95%"
                                                    :stop-color="chartColor"
                                                    stop-opacity="0" />
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
                                                new Date(d).toLocaleDateString(
                                                    'en-US',
                                                    {
                                                        month: 'short',
                                                        day: 'numeric',
                                                    },
                                                )
                                        " />
                                    <VisAxis
                                        v-if="!isMobile"
                                        type="y"
                                        :gridLine="false"
                                        :tickFormat="
                                            (d: number) =>
                                                formatCompactCurrency(d)
                                        " />
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
                                    <ChartTooltip
                                        :customComponent="
                                            ChartTooltipContent
                                        " />
                                </VisXYContainer>
                            </ChartContainer>
                            <template #fallback>
                                <div
                                    class="flex h-full items-center justify-center">
                                    <Skeleton class="h-full w-full" />
                                </div>
                            </template>
                        </ClientOnly>
                    </div>
                </div>
            </div>

            <!-- Transactions -->
            <div
                class="bg-card text-card-foreground rounded-xl border p-6 shadow-sm">
                <div class="mb-4">
                    <h3
                        class="text-lg leading-none font-semibold tracking-tight">
                        Transactions
                    </h3>
                </div>
                <div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead class="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell
                                    colspan="4"
                                    class="text-muted-foreground h-24 text-center">
                                    No transactions yet.
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </div>
        </template>

        <!-- Modals -->
        <AccountFormModal
            v-model:open="isFormModalOpen"
            :account="account"
            @saved="onFormSaved" />

        <AlertDialog
            :open="isDeleteDialogOpen"
            @update:open="isDeleteDialogOpen = $event">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. The account "{{
                            account?.name
                        }}" and all its associated data will be deleted.
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
