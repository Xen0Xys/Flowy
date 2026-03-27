<script lang="ts" setup>
import {ref} from "vue";
import {
    type ColumnDef,
    FlexRender,
    getCoreRowModel,
    getSortedRowModel,
    type SortingState,
    useVueTable,
} from "@tanstack/vue-table";

import type {Transaction} from "~/stores/transaction.store";
import {useFamilyStore} from "~/stores/family.store";
import {toCurrency} from "~/lib/currency";

import {Button} from "~/components/ui/button";
import {Badge} from "~/components/ui/badge";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table";
import {valueUpdater} from "~/components/ui/table/utils";

const props = defineProps<{
    transactions: Transaction[];
}>();

const emit = defineEmits<{
    (e: "row-click", transaction: Transaction): void;
}>();

const familyStore = useFamilyStore();

const sorting = ref<SortingState>([{id: "date", desc: true}]);

const formatCurrency = (value: number) => {
    const currency = familyStore.family?.currency || "USD";
    return toCurrency(value, currency);
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
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

const columns: ColumnDef<Transaction>[] = [
    {
        accessorKey: "date",
        header: "Date",
        enableSorting: true,
    },
    {
        accessorKey: "description",
        header: "Description",
        enableSorting: true,
    },
    {
        id: "category",
        accessorFn: (row) => row.category?.name || "-",
        header: "Category",
        enableSorting: true,
    },
    {
        accessorKey: "amount",
        header: "Amount",
        enableSorting: true,
    },
];

const table = useVueTable({
    get data() {
        return props.transactions;
    },
    get columns() {
        return columns;
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
                            cell.column.id === 'amount' ? 'text-right' : '',
                            cell.column.id === 'date' ? 'w-[150px]' : '',
                            cell.column.id === 'category' ? 'w-[200px]' : '',
                            cell.column.id === 'amount' ? 'w-[150px]' : '',
                        ]">
                        <template v-if="cell.column.id === 'date'">
                            {{ formatDate(cell.getValue()) }}
                        </template>

                        <template v-else-if="cell.column.id === 'description'">
                            <span class="font-medium">{{ cell.getValue() }}</span>
                        </template>

                        <template v-else-if="cell.column.id === 'category'">
                            <Badge
                                v-if="row.original.category"
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

                        <template v-else-if="cell.column.id === 'amount'">
                            <span :class="amountClass(cell.getValue())" class="font-medium">
                                {{ formatCurrency(cell.getValue()) }}
                            </span>
                        </template>

                        <FlexRender v-else :props="cell.getContext()" :render="cell.column.columnDef.cell" />
                    </TableCell>
                </TableRow>

                <TableRow v-if="table.getRowModel().rows.length === 0">
                    <TableCell :colspan="columns.length" class="text-muted-foreground h-24 text-center">
                        No transactions found.
                    </TableCell>
                </TableRow>
            </TableBody>
        </Table>
    </div>
</template>
