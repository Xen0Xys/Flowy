<script lang="ts" setup>
import {computed, ref} from "vue";
import {useI18n} from "vue-i18n";
import {
    type ColumnDef,
    FlexRender,
    getCoreRowModel,
    getSortedRowModel,
    type SortingState,
    useVueTable,
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
import {valueUpdater} from "~/components/ui/table/utils";

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
    if (value < 0) return "text-red-500 dark:text-red-400";
    if (value > 0) return "text-emerald-600 dark:text-emerald-500";
    return "text-foreground";
};

const columns = computed<ColumnDef<Transaction>[]>(() => {
    if (isMobile.value) {
        return [
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
        ];
    }

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

const table = useVueTable({
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
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
});
</script>

<template>
    <div class="w-full">
        <Table wrapperClass="overflow-visible pr-3">
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
                            isMobile || isCompactHeight ? 'h-[2.3125rem] py-0' : 'h-[2.6875rem] py-0',
                            cell.column.id === 'amount' ? 'text-right' : '',
                            cell.column.id === 'date' ? (isMobile ? 'w-[115px]' : 'w-[150px]') : '',
                            cell.column.id === 'account' ? 'w-[180px]' : '',
                            cell.column.id === 'category' ? 'w-[200px]' : '',
                            cell.column.id === 'description' ? (isMobile ? 'max-w-[180px]' : 'max-w-[360px]') : '',
                            cell.column.id === 'amount' ? 'w-[150px]' : '',
                        ]">
                        <template v-if="cell.column.id === 'date'">
                            {{ formatDate(cell.getValue()) }}
                        </template>

                        <template v-else-if="cell.column.id === 'description'">
                            <span
                                v-if="row.original.isRebalance"
                                :title="String(cell.getValue())"
                                class="text-muted-foreground flex min-w-0 items-center gap-1.5 font-medium italic">
                                <Icon class="h-4 w-4" name="iconoir:system-restart" />
                                <span class="block truncate">{{ cell.getValue() }}</span>
                            </span>
                            <span
                                v-else-if="row.original.linkedTransactionId"
                                :title="String(cell.getValue())"
                                class="flex min-w-0 items-center gap-1.5 font-medium">
                                <Icon class="h-4 w-4 text-blue-500" name="iconoir:data-transfer-both" />
                                <span class="block truncate">{{ cell.getValue() }}</span>
                            </span>
                            <span v-else :class="cn('block truncate font-medium')" :title="String(cell.getValue())">
                                {{ cell.getValue() }}
                            </span>
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
                        <template v-if="isMobile">
                            <TableCell class="w-[115px]">
                                <Skeleton class="h-4 w-20" />
                            </TableCell>
                            <TableCell class="max-w-[180px]">
                                <Skeleton class="h-4 w-32" />
                            </TableCell>
                        </template>
                        <template v-else>
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
                        </template>
                    </TableRow>
                </template>
            </TableBody>
        </Table>
    </div>
</template>
