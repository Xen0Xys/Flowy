<script lang="ts" setup>
import type {ParsedTransaction} from "~/composables/useCsvParser";
import {cn} from "~/lib/utils";
import type {TransactionCategory, TransactionMerchant} from "~/stores/transaction.store";
import CategoryDialog from "~/components/references/CategoryDialog.vue";
import MerchantDialog from "~/components/references/MerchantDialog.vue";
import TransactionReferenceCombobox from "~/components/transactions/TransactionReferenceCombobox.vue";

const props = defineProps<{
    transactions: ParsedTransaction[];
    duplicateGroups: Map<string, string[]>;
    stats: {
        total: number;
        pending: number;
        duplicates: number;
        dbDups: number;
        willImport: number;
        errors: number;
    };
    isTesting: boolean;
    isImporting: boolean;
}>();

const emit = defineEmits<{
    (e: "ignore", id: string): void;
    (e: "restore", id: string): void;
    (e: "assign-category", id: string, categoryId: string | null): void;
    (e: "assign-merchant", id: string, merchantId: string | null): void;
    (e: "test"): void;
    (e: "import"): void;
}>();

const {t} = useI18n();
const referenceStore = useReferenceStore();
const createMerchantDialog = ref(false);
const createCategoryDialog = ref(false);
const activeTransactionId = ref<string | null>(null);

// Pagination
const PAGE_SIZE = 100;
const currentPage = ref(1);
const totalPages = computed(() => Math.ceil(props.transactions.length / PAGE_SIZE));
const paginatedTransactions = computed(() => {
    const start = (currentPage.value - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return props.transactions.slice(start, end);
});

const categoryItems = computed(() =>
    referenceStore.categories.map((c) => ({id: c.id, name: c.name, icon: c.icon, hexColor: c.hexColor})),
);
const merchantItems = computed(() => referenceStore.merchants.map((m) => ({id: m.id, name: m.name})));

// O(1) lookup for transaction by ID (for duplicate info)
const transactionById = computed(() => {
    const map = new Map<string, ParsedTransaction>();
    for (const tx of props.transactions) {
        map.set(tx.id, tx);
    }
    return map;
});

// Fetch references if not loaded
onMounted(() => {
    if (!referenceStore.isLoaded) {
        referenceStore.fetchReferences();
    }
});

// Reset to page 1 when transactions change
watch(
    () => props.transactions.length,
    () => {
        currentPage.value = 1;
    },
);

// Get duplicate info for a transaction (O(1) lookup)
function getDuplicateInfo(transaction: ParsedTransaction) {
    if (transaction.status === "duplicate_internal" && transaction.duplicateOf) {
        const original = transactionById.value.get(transaction.duplicateOf);
        if (original) {
            return {type: "internal", original};
        }
    }
    return null;
}

// Status badge styling
function getStatusBadgeVariant(status: ParsedTransaction["status"]) {
    switch (status) {
        case "will_import":
            return "default";
        case "duplicate_internal":
        case "duplicate_db":
            return "secondary";
        case "error":
            return "destructive";
        default:
            return "outline";
    }
}

function getStatusBadgeText(status: ParsedTransaction["status"]) {
    switch (status) {
        case "pending":
            return t("import.preview.status.pending");
        case "will_import":
            return t("import.preview.status.willImport");
        case "duplicate_internal":
            return t("import.preview.status.duplicateInternal");
        case "duplicate_db":
            return t("import.preview.status.duplicateDb");
        case "error":
            return t("import.preview.status.ignored");
        default:
            return status;
    }
}

function handleCategoryChange(transactionId: string, value: string) {
    emit("assign-category", transactionId, value === "none" ? null : value);
}

function handleMerchantChange(transactionId: string, value: string) {
    emit("assign-merchant", transactionId, value === "none" ? null : value);
}

// Open create merchant dialog
function openCreateMerchant(transactionId: string) {
    activeTransactionId.value = transactionId;
    createMerchantDialog.value = true;
}

// Open create category dialog
function openCreateCategory(transactionId: string) {
    activeTransactionId.value = transactionId;
    createCategoryDialog.value = true;
}

function onCategorySaved(category: TransactionCategory) {
    if (activeTransactionId.value) {
        emit("assign-category", activeTransactionId.value, category.id);
    }
    activeTransactionId.value = null;
}

function onMerchantSaved(merchant: TransactionMerchant) {
    if (activeTransactionId.value) {
        emit("assign-merchant", activeTransactionId.value, merchant.id);
    }
    activeTransactionId.value = null;
}

watch(createCategoryDialog, (isOpen) => {
    if (!isOpen) activeTransactionId.value = null;
});

watch(createMerchantDialog, (isOpen) => {
    if (!isOpen) activeTransactionId.value = null;
});

const canImport = computed(() => {
    return props.stats.willImport > 0 && !props.isTesting && !props.isImporting;
});

function formatDateForDisplay(date: string): string {
    return date.split("T")[0] ?? date;
}
</script>

<template>
    <div class="flex h-full flex-col">
        <!-- Stats bar -->
        <div class="bg-muted/30 border-b px-6 py-4">
            <div class="flex flex-wrap items-center gap-4">
                <div class="flex items-center gap-2">
                    <Icon class="h-4 w-4" name="iconoir:list" />
                    <span class="font-medium">{{ stats.total }}</span>
                    <span class="text-muted-foreground text-sm">{{ t("import.preview.stats.total") }}</span>
                </div>
                <div class="flex items-center gap-2">
                    <Icon class="text-success h-4 w-4" name="iconoir:check-circle" />
                    <span class="text-success font-medium tabular-nums">{{ stats.willImport }}</span>
                    <span class="text-muted-foreground text-sm">{{ t("import.preview.stats.willImport") }}</span>
                </div>
                <div v-if="stats.duplicates > 0" class="flex items-center gap-2">
                    <Icon class="text-warning h-4 w-4" name="iconoir:warning-triangle" />
                    <span class="text-warning font-medium tabular-nums">{{ stats.duplicates }}</span>
                    <span class="text-muted-foreground text-sm">{{ t("import.preview.stats.duplicates") }}</span>
                </div>
                <div v-if="stats.dbDups > 0" class="flex items-center gap-2">
                    <Icon class="text-destructive h-4 w-4" name="iconoir:database" />
                    <span class="text-destructive font-medium tabular-nums">{{ stats.dbDups }}</span>
                    <span class="text-muted-foreground text-sm">{{ t("import.preview.stats.dbDuplicates") }}</span>
                </div>
                <div v-if="stats.errors > 0" class="flex items-center gap-2">
                    <Icon class="text-muted-foreground h-4 w-4" name="iconoir:cancel" />
                    <span class="text-muted-foreground font-medium">{{ stats.errors }}</span>
                    <span class="text-muted-foreground text-sm">{{ t("import.preview.stats.ignored") }}</span>
                </div>
            </div>
        </div>

        <!-- Transactions table -->
        <ScrollArea class="min-h-0 flex-1 overflow-hidden">
            <Table>
                <TableHeader class="bg-muted sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))]">
                    <TableRow>
                        <TableHead class="w-12">#</TableHead>
                        <TableHead class="min-w-25">{{ t("transactions.table.date") }}</TableHead>
                        <TableHead class="min-w-50">{{ t("transactions.table.description") }}</TableHead>
                        <TableHead class="min-w-25">{{ t("transactions.table.amount") }}</TableHead>
                        <TableHead class="min-w-35">{{ t("transactions.table.category") }}</TableHead>
                        <TableHead class="min-w-35">{{ t("transactions.filters.merchant") }}</TableHead>
                        <TableHead class="relative w-28">
                            {{ t("common.actions") }}
                            <div
                                class="bg-muted absolute top-0 right-[-12px] h-full w-[12px] border-b shadow-[0_1px_0_hsl(var(--border))]"></div>
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow
                        v-for="(transaction, index) in paginatedTransactions"
                        :key="transaction.id"
                        :class="
                            cn(
                                transaction.status === 'error' && 'opacity-50',
                                transaction.status === 'duplicate_internal' && 'bg-warning/5',
                                transaction.status === 'duplicate_db' && 'bg-destructive/5',
                            )
                        ">
                        <TableCell class="text-muted-foreground">
                            {{ (currentPage - 1) * PAGE_SIZE + index + 1 }}
                        </TableCell>
                        <TableCell>
                            {{ formatDateForDisplay(transaction.date) }}
                        </TableCell>
                        <TableCell class="max-w-[300px] truncate">
                            {{ transaction.description }}
                        </TableCell>
                        <TableCell>
                            <span
                                :class="
                                    cn(
                                        'font-medium tabular-nums',
                                        transaction.amount > 0 ? 'text-success' : 'text-destructive',
                                    )
                                ">
                                {{ transaction.amount.toFixed(2) }}
                            </span>
                        </TableCell>
                        <TableCell>
                            <TransactionReferenceCombobox
                                :model-value="transaction.categoryId ?? 'none'"
                                :items="categoryItems"
                                :placeholder="t('transactions.form.selectCategory')"
                                :empty-text="t('transactions.form.noResults')"
                                :none-label="t('common.none')"
                                :create-label="t('settings.references.addCategory')"
                                @update:model-value="(v: string) => handleCategoryChange(transaction.id, v)"
                                @create="openCreateCategory(transaction.id)" />
                        </TableCell>
                        <TableCell>
                            <TransactionReferenceCombobox
                                :model-value="transaction.merchantId ?? 'none'"
                                :items="merchantItems"
                                :placeholder="t('transactions.form.selectMerchant')"
                                :empty-text="t('transactions.form.noResults')"
                                :none-label="t('common.none')"
                                :create-label="t('settings.references.addMerchant')"
                                @update:model-value="(v: string) => handleMerchantChange(transaction.id, v)"
                                @create="openCreateMerchant(transaction.id)" />
                        </TableCell>
                        <TableCell>
                            <div class="flex items-center gap-1">
                                <Badge :variant="getStatusBadgeVariant(transaction.status)">
                                    {{ getStatusBadgeText(transaction.status) }}
                                </Badge>
                                <Button
                                    v-if="transaction.status !== 'error'"
                                    size="icon-sm"
                                    variant="ghost"
                                    @click="emit('ignore', transaction.id)">
                                    <Icon class="h-4 w-4" name="iconoir:cancel" />
                                </Button>
                                <Button
                                    v-if="transaction.status === 'error'"
                                    size="icon-sm"
                                    variant="ghost"
                                    @click="emit('restore', transaction.id)">
                                    <Icon class="h-4 w-4" name="iconoir:undo" />
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </ScrollArea>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 border-t px-6 py-3">
            <Button :disabled="currentPage === 1" size="sm" variant="ghost" @click="currentPage--">
                <Icon class="h-4 w-4" name="iconoir:nav-arrow-left" />
            </Button>
            <span class="text-muted-foreground text-sm">
                {{ t("import.preview.pagination", {page: currentPage, total: totalPages}) }}
            </span>
            <Button :disabled="currentPage === totalPages" size="sm" variant="ghost" @click="currentPage++">
                <Icon class="h-4 w-4" name="iconoir:nav-arrow-right" />
            </Button>
        </div>

        <!-- Actions bar -->
        <div class="flex items-center justify-between border-t px-6 py-4">
            <p class="text-muted-foreground text-sm">
                {{ t("import.preview.readyToImport", {count: stats.willImport}) }}
            </p>
            <div class="flex gap-2">
                <Button :disabled="isTesting || isImporting" variant="outline" @click="emit('test')">
                    <Icon
                        :class="cn('mr-2 h-4 w-4', isTesting && 'animate-spin')"
                        :name="isTesting ? 'iconoir:refresh' : 'iconoir:database'" />
                    {{ t("import.actions.testDb") }}
                </Button>
                <Button :disabled="!canImport" @click="emit('import')">
                    <Icon
                        :class="cn('mr-2 h-4 w-4', isImporting && 'animate-spin')"
                        :name="isImporting ? 'iconoir:refresh' : 'iconoir:upload'" />
                    {{ t("import.actions.import") }}
                </Button>
            </div>
        </div>

        <CategoryDialog v-model:open="createCategoryDialog" @saved="onCategorySaved" />
        <MerchantDialog v-model:open="createMerchantDialog" @saved="onMerchantSaved" />
    </div>
</template>

<style scoped>
:deep([data-slot="table-container"]) {
    overflow: visible;
    padding-right: 0.75rem;
}
:deep([data-slot="scroll-area-scrollbar"][data-orientation="vertical"]) {
    padding-top: 41px;
}
</style>
