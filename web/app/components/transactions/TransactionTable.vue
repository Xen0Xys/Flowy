<script lang="ts" setup>
import {computed, ref} from "vue";
import {useI18n} from "vue-i18n";
import {
    type ColumnDef,
    columnVisibilityFeature,
    createSortedRowModel,
    FlexRender,
    rowSortingFeature,
    sortFns,
    type SortingState,
    tableFeatures,
    useTable,
} from "@tanstack/vue-table";
import {useMediaQuery} from "@vueuse/core";
import {cn} from "~/lib/utils";

import type {Transaction} from "~/stores/transaction.store";
import {useFamilyStore} from "~/stores/family.store";
import {toCurrency} from "~/lib/currency";

import {Button} from "~/components/ui/button";
import {Badge} from "~/components/ui/badge";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table";
import {Skeleton} from "~/components/ui/skeleton";
import {valueUpdater} from "~/lib/table";

const props = defineProps<{
    transactions: Transaction[];
    isFiltered?: boolean;
    showAccountColumn?: boolean;
    accountNameById?: Record<string, string>;
    isLoading?: boolean;
}>();

const emit = defineEmits<{
    (e: "row-click", transaction: Transaction): void;
}>();

const familyStore = useFamilyStore();
const isMobile = useMediaQuery("(max-width: 768px)");
const isCompactHeight = useMediaQuery("(max-height: 1080px)");
const {locale, t} = useI18n();

const sorting = ref<SortingState>([{id: "date", desc: true}]);

const formatCurrency = (value: number) => {
    const currency = familyStore.family?.currency || "USD";
    return toCurrency(value, currency);
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale.value || "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
};

const amountClass = (value: number) => {
    if (value < 0) return "text-destructive";
    if (value > 0) return "text-success";
    return "text-foreground";
};

const getLocalDayKey = (dateString: string): string => {
    const d = new Date(dateString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const dayLongFormatter = computed(
    () =>
        new Intl.DateTimeFormat(locale.value || "en-US", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
        }),
);

const formatDayGroupLabel = (dayKey: string): string => {
    const [year, month, day] = dayKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.getTime() === today.getTime()) {
        return t("transactions.table.today");
    }
    if (date.getTime() === yesterday.getTime()) {
        return t("transactions.table.yesterday");
    }
    return dayLongFormatter.value.format(date);
};

type DayGroup = {
    dayKey: string;
    label: string;
    total: number;
    transactions: Transaction[];
};

const groupedByDay = computed<DayGroup[]>(() => {
    if (!isMobile.value) return [];

    const map = new Map<string, DayGroup>();
    for (const tx of props.transactions) {
        const dayKey = getLocalDayKey(tx.date);
        let group = map.get(dayKey);
        if (!group) {
            group = {dayKey, label: formatDayGroupLabel(dayKey), total: 0, transactions: []};
            map.set(dayKey, group);
        }
        group.total += tx.amount;
        group.transactions.push(tx);
    }
    return Array.from(map.values());
});

const buildSubtext = (tx: Transaction): string => {
    const parts: string[] = [];
    if (tx.isRebalance) {
        parts.push(t("transactions.table.system"));
    } else if (tx.category) {
        parts.push(tx.category.name);
    }
    if (tx.merchant?.name) {
        parts.push(tx.merchant.name);
    }
    if (props.showAccountColumn) {
        const accountName = props.accountNameById?.[tx.accountId];
        if (accountName) parts.push(accountName);
    }
    return parts.join(" · ");
};

const rowIconName = (tx: Transaction): string => {
    if (tx.isRebalance) return "iconoir:system-restart";
    if (tx.linkedTransactionId) return "iconoir:data-transfer-both";
    if (tx.category) return tx.category.icon;
    if (tx.amount > 0) return "iconoir:arrow-down-left";
    return "iconoir:arrow-up-right";
};

const rowIconStyle = (tx: Transaction): Record<string, string> => {
    if (tx.isRebalance || tx.linkedTransactionId || !tx.category) return {};
    return {
        color: tx.category.hexColor,
        backgroundColor: `${tx.category.hexColor}15`,
        borderColor: `${tx.category.hexColor}40`,
    };
};

const rowIconClass = (tx: Transaction): string => {
    if (tx.isRebalance) return "text-muted-foreground bg-muted border-border";
    if (tx.linkedTransactionId) return "text-accent bg-accent/10 border-accent/30";
    if (tx.category) return "";
    if (tx.amount > 0) return "text-success bg-success/10 border-success/30";
    return "text-destructive bg-destructive/10 border-destructive/30";
};

const columns = computed<ColumnDef<Transaction>[]>(() => {
    const baseColumns: ColumnDef<Transaction>[] = [
        {
            accessorKey: "date",
            header: t("transactions.table.date"),
            enableSorting: true,
        },
        {
            accessorKey: "description",
            header: t("transactions.table.description"),
            enableSorting: true,
        },
        {
            id: "category",
            accessorFn: (row) => row.category?.name || "-",
            header: t("transactions.table.category"),
            enableSorting: true,
        },
        {
            accessorKey: "amount",
            header: t("transactions.table.amount"),
            enableSorting: true,
        },
    ];

    if (!props.showAccountColumn) {
        return baseColumns;
    }

    const accountColumn: ColumnDef<Transaction> = {
        id: "account",
        accessorFn: (row) => props.accountNameById?.[row.accountId] || "-",
        header: t("transactions.table.account"),
        enableSorting: true,
    };

    return [baseColumns[0], accountColumn, ...baseColumns.slice(1)];
});

const features = tableFeatures({
    rowSortingFeature,
    columnVisibilityFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns,
});

const table = useTable({
    features,
    get data() {
        return props.transactions;
    },
    get columns() {
        return columns.value;
    },
    state: {
        get sorting() {
            return sorting.value;
        },
    },
    onSortingChange: (updater) => valueUpdater(updater, sorting),
});
</script>

<template>
    <div class="w-full">
        <!-- Mobile: Card list grouped by day -->
        <div v-if="isMobile" class="flex flex-col">
            <template v-if="transactions.length === 0 && isLoading">
                <div v-for="i in 6" :key="`m-skel-${i}`" class="flex items-center gap-3 border-b px-4 py-3">
                    <Skeleton class="size-10 shrink-0 rounded-full" />
                    <div class="flex min-w-0 flex-1 flex-col gap-2">
                        <div class="flex items-center justify-between gap-2">
                            <Skeleton class="h-4 w-32" />
                            <Skeleton class="h-4 w-16" />
                        </div>
                        <Skeleton class="h-3 w-24" />
                    </div>
                </div>
            </template>

            <template v-else-if="transactions.length === 0">
                <div class="text-muted-foreground flex h-40 items-center justify-center px-4 text-center text-sm">
                    {{ isFiltered ? t("transactions.table.noMatch") : t("transactions.table.noTransactions") }}
                </div>
            </template>

            <template v-else>
                <div v-for="group in groupedByDay" :key="group.dayKey">
                    <div
                        class="bg-muted/70 supports-[backdrop-filter]:bg-muted/60 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-1.5 text-xs font-medium backdrop-blur">
                        <span class="text-muted-foreground truncate tracking-wide uppercase">{{ group.label }}</span>
                        <span :class="amountClass(group.total)" class="shrink-0 tabular-nums">
                            {{ formatCurrency(group.total) }}
                        </span>
                    </div>
                    <button
                        v-for="tx in group.transactions"
                        :key="tx.id"
                        type="button"
                        class="hover:bg-muted/40 active:bg-muted/60 flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors"
                        @click="emit('row-click', tx)">
                        <div
                            :class="
                                cn(
                                    'flex size-10 shrink-0 items-center justify-center rounded-full border',
                                    rowIconClass(tx),
                                )
                            "
                            :style="rowIconStyle(tx)">
                            <Icon :name="rowIconName(tx)" class="size-5" />
                        </div>
                        <div class="flex min-w-0 flex-1 flex-col">
                            <div class="flex items-center justify-between gap-2">
                                <span
                                    :class="
                                        cn('truncate font-medium', tx.isRebalance && 'text-muted-foreground italic')
                                    ">
                                    {{ tx.description }}
                                </span>
                                <span :class="amountClass(tx.amount)" class="shrink-0 font-semibold tabular-nums">
                                    {{ formatCurrency(tx.amount) }}
                                </span>
                            </div>
                            <div v-if="buildSubtext(tx)" class="text-muted-foreground mt-0.5 truncate text-xs">
                                {{ buildSubtext(tx) }}
                            </div>
                        </div>
                    </button>
                </div>

                <template v-if="isLoading">
                    <div v-for="i in 3" :key="`m-more-skel-${i}`" class="flex items-center gap-3 border-b px-4 py-3">
                        <Skeleton class="size-10 shrink-0 rounded-full" />
                        <div class="flex min-w-0 flex-1 flex-col gap-2">
                            <div class="flex items-center justify-between gap-2">
                                <Skeleton class="h-4 w-32" />
                                <Skeleton class="h-4 w-16" />
                            </div>
                            <Skeleton class="h-3 w-24" />
                        </div>
                    </div>
                </template>
            </template>
        </div>

        <!-- Desktop: Table -->
        <Table v-else>
            <TableHeader class="bg-muted sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))]">
                <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id" class="border-b">
                    <TableHead
                        v-for="(header, index) in headerGroup.headers"
                        :key="header.id"
                        :class="[
                            header.id === 'amount' ? 'text-right' : '',
                            index === headerGroup.headers.length - 1 ? 'relative w-[calc(100%+12px)]' : '',
                        ]">
                        <div v-if="header.isPlaceholder"></div>
                        <Button
                            v-else-if="header.column.getCanSort()"
                            :class="header.id === 'amount' ? '-mr-2 ml-auto flex items-center justify-end' : ''"
                            class="-ml-2 h-8 px-2"
                            size="sm"
                            variant="ghost"
                            @click="header.column.toggleSorting(header.column.getIsSorted() === 'asc')">
                            {{ header.column.columnDef.header }}
                            <Icon
                                v-if="header.column.getIsSorted() === 'asc'"
                                class="ml-2 h-4 w-4"
                                name="iconoir:nav-arrow-up" />
                            <Icon
                                v-else-if="header.column.getIsSorted() === 'desc'"
                                class="ml-2 h-4 w-4"
                                name="iconoir:nav-arrow-down" />
                            <Icon
                                v-else
                                class="text-muted-foreground/50 ml-2 h-4 w-4"
                                name="iconoir:arrow-separate-vertical" />
                        </Button>
                        <div v-else :class="header.id === 'amount' ? 'text-right' : ''">
                            {{ header.column.columnDef.header }}
                        </div>
                        <!-- Background extension for the last column to cover the gap -->
                        <div
                            v-if="index === headerGroup.headers.length - 1"
                            class="bg-muted absolute top-0 right-[-12px] h-full w-[12px] border-b shadow-[0_1px_0_hsl(var(--border))]"></div>
                    </TableHead>
                </TableRow>
            </TableHeader>

            <TableBody>
                <TableRow
                    v-for="row in table.getRowModel().rows"
                    :key="row.id"
                    class="hover:bg-muted/50 cursor-pointer transition-colors"
                    @click="emit('row-click', row.original)">
                    <TableCell
                        v-for="cell in row.getVisibleCells()"
                        :key="cell.id"
                        :class="[
                            isCompactHeight ? 'h-[2.3125rem] py-0' : 'h-[2.6875rem] py-0',
                            cell.column.id === 'amount' ? 'text-right tabular-nums' : '',
                            cell.column.id === 'date' ? 'w-[150px]' : '',
                            cell.column.id === 'account' ? 'w-[180px]' : '',
                            cell.column.id === 'category' ? 'w-[200px]' : '',
                            cell.column.id === 'description' ? 'max-w-[360px]' : '',
                            cell.column.id === 'amount' ? 'w-[150px]' : '',
                        ]">
                        <template v-if="cell.column.id === 'date'">
                            {{ formatDate(cell.getValue()) }}
                        </template>

                        <template v-else-if="cell.column.id === 'description'">
                            <div class="flex min-w-0 flex-col">
                                <span
                                    v-if="row.original.isRebalance"
                                    :title="String(cell.getValue())"
                                    class="text-muted-foreground flex min-w-0 items-center gap-1.5 font-medium italic">
                                    <Icon class="h-4 w-4 shrink-0" name="iconoir:system-restart" />
                                    <span class="block truncate">{{ cell.getValue() }}</span>
                                </span>
                                <span
                                    v-else-if="row.original.linkedTransactionId"
                                    :title="String(cell.getValue())"
                                    class="flex min-w-0 items-center gap-1.5 font-medium">
                                    <Icon class="text-accent h-4 w-4 shrink-0" name="iconoir:data-transfer-both" />
                                    <span class="block truncate">{{ cell.getValue() }}</span>
                                </span>
                                <span v-else :class="cn('block truncate font-medium')" :title="String(cell.getValue())">
                                    {{ cell.getValue() }}
                                </span>
                                <span
                                    v-if="row.original.merchant?.name"
                                    class="text-muted-foreground block truncate text-xs"
                                    :title="row.original.merchant.name">
                                    {{ row.original.merchant.name }}
                                </span>
                            </div>
                        </template>

                        <template v-else-if="cell.column.id === 'category'">
                            <Badge
                                v-if="row.original.isRebalance"
                                class="text-muted-foreground flex w-fit items-center gap-1.5 border-dashed bg-transparent px-2 py-0.5 whitespace-nowrap hover:bg-transparent"
                                variant="outline">
                                {{ t("transactions.table.system") }}
                            </Badge>
                            <Badge
                                v-else-if="row.original.category"
                                :style="{
                                    borderColor: row.original.category.hexColor,
                                    color: row.original.category.hexColor,
                                    backgroundColor: `${row.original.category.hexColor}15`,
                                }"
                                class="flex w-fit items-center gap-1.5 px-2 py-0.5 whitespace-nowrap"
                                variant="outline">
                                <Icon :name="row.original.category.icon" class="h-3 w-3" />
                                {{ row.original.category.name }}
                            </Badge>
                            <span v-else class="text-muted-foreground">-</span>
                        </template>

                        <template v-else-if="cell.column.id === 'account'">
                            <span class="text-muted-foreground font-medium">{{ cell.getValue() }}</span>
                        </template>

                        <template v-else-if="cell.column.id === 'amount'">
                            <span :class="amountClass(cell.getValue())" class="font-medium">
                                {{ formatCurrency(cell.getValue()) }}
                            </span>
                        </template>

                        <FlexRender v-else :props="cell.getContext()" :render="cell.column.columnDef.cell" />
                    </TableCell>
                </TableRow>

                <TableRow v-if="table.getRowModel().rows.length === 0 && !isLoading">
                    <TableCell :colspan="columns.length" class="text-muted-foreground h-24 text-center">
                        {{ isFiltered ? t("transactions.table.noMatch") : t("transactions.table.noTransactions") }}
                    </TableCell>
                </TableRow>

                <template v-if="isLoading">
                    <TableRow v-for="i in 5" :key="`skeleton-${i}`" class="hover:bg-muted/50">
                        <TableCell class="w-[150px]">
                            <Skeleton class="h-4 w-20" />
                        </TableCell>
                        <TableCell v-if="showAccountColumn" class="w-[180px]">
                            <Skeleton class="h-4 w-24" />
                        </TableCell>
                        <TableCell class="max-w-[360px]">
                            <Skeleton class="h-4 w-48" />
                        </TableCell>
                        <TableCell class="w-[200px]">
                            <Skeleton class="h-5 w-16" />
                        </TableCell>
                        <TableCell class="w-[150px] text-right">
                            <Skeleton class="ml-auto h-4 w-20" />
                        </TableCell>
                    </TableRow>
                </template>
            </TableBody>
        </Table>
    </div>
</template>

<style scoped>
:deep([data-slot="table-container"]) {
    overflow: visible;
    padding-right: 0.75rem;
}
</style>
