<script lang="ts" setup>
import type {ParsedTransaction} from "~/composables/useCsvParser";
import {cn} from "~/lib/utils";

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
    (e: "assignCategory", id: string, categoryId: string | null): void;
    (e: "assignMerchant", id: string, merchantId: string | null): void;
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

// O(1) lookup maps for categories and merchants
const categoryMap = computed(() => {
    const map = new Map<string, {id: string; name: string; hexColor: string}>();
    for (const cat of referenceStore.categories) {
        map.set(cat.id, cat);
    }
    return map;
});

const merchantMap = computed(() => {
    const map = new Map<string, {id: string; name: string}>();
    for (const merch of referenceStore.merchants) {
        map.set(merch.id, merch);
    }
    return map;
});

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

// Category select handler
function handleCategoryChange(transactionId: string, categoryId: string | null) {
    emit("assignCategory", transactionId, categoryId);
}

// Merchant select handler
function handleMerchantChange(transactionId: string, merchantId: string | null) {
    emit("assignMerchant", transactionId, merchantId);
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

// Handle merchant created
async function handleMerchantCreated(name: string) {
    try {
        const merchant = await referenceStore.createMerchant({name});
        if (activeTransactionId.value) {
            emit("assignMerchant", activeTransactionId.value, merchant.id);
        }
        createMerchantDialog.value = false;
        activeTransactionId.value = null;
    } catch (error) {
        // Error handled by store
    }
}

// Handle category created
async function handleCategoryCreated(payload: {name: string; hexColor: string; icon: string}) {
    try {
        const category = await referenceStore.createCategory(payload);
        if (activeTransactionId.value) {
            emit("assignCategory", activeTransactionId.value, category.id);
        }
        createCategoryDialog.value = false;
        activeTransactionId.value = null;
    } catch (error) {
        // Error handled by store
    }
}

const canImport = computed(() => {
    return props.stats.willImport > 0 && !props.isTesting && !props.isImporting;
});

// Category presets (matching references.vue)
const PRESET_COLORS = [
    "#ef4444", // Red
    "#f97316", // Orange
    "#f59e0b", // Amber
    "#ca8a04", // Yellow
    "#84cc16", // Lime
    "#22c55e", // Green
    "#10b981", // Emerald
    "#14b8a6", // Teal
    "#06b6d4", // Cyan
    "#0ea5e9", // Sky
    "#3b82f6", // Blue
    "#6366f1", // Indigo
    "#8b5cf6", // Violet
    "#a855f7", // Purple
    "#ec4899", // Pink
    "#64748b", // Slate
];

const PRESET_ICONS = [
    "iconoir:label",
    "iconoir:home",
    "iconoir:car",
    "iconoir:bus",
    "iconoir:cart",
    "iconoir:shopping-bag",
    "iconoir:coffee-cup",
    "iconoir:apple-mac",
    "iconoir:tv",
    "iconoir:shirt",
    "iconoir:book",
    "iconoir:gym",
    "iconoir:airplane",
    "iconoir:heart",
];

const newCategoryName = ref("");
const newCategoryColor = ref(PRESET_COLORS[0]!);
const newCategoryIcon = ref(PRESET_ICONS[0]!);

const newMerchantName = ref("");

const isCreatingCategory = ref(false);
const isCreatingMerchant = ref(false);

// Format date for display (extract YYYY-MM-DD from ISO-8601 DateTime)
function formatDateForDisplay(date: string): string {
    return date.split("T")[0] ?? date;
}

async function submitCategory() {
    if (!newCategoryName.value.trim()) return;
    isCreatingCategory.value = true;
    try {
        await handleCategoryCreated({
            name: newCategoryName.value.trim(),
            hexColor: newCategoryColor.value,
            icon: newCategoryIcon.value,
        });
        newCategoryName.value = "";
    } finally {
        isCreatingCategory.value = false;
    }
}

async function submitMerchant() {
    if (!newMerchantName.value.trim()) return;
    isCreatingMerchant.value = true;
    try {
        await handleMerchantCreated(newMerchantName.value.trim());
        newMerchantName.value = "";
    } finally {
        isCreatingMerchant.value = false;
    }
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
                    <Icon class="h-4 w-4 text-green-500" name="iconoir:check-circle" />
                    <span class="font-medium text-green-600 dark:text-green-400">{{ stats.willImport }}</span>
                    <span class="text-muted-foreground text-sm">{{ t("import.preview.stats.willImport") }}</span>
                </div>
                <div v-if="stats.duplicates > 0" class="flex items-center gap-2">
                    <Icon class="h-4 w-4 text-orange-500" name="iconoir:warning-triangle" />
                    <span class="font-medium text-orange-600 dark:text-orange-400">{{ stats.duplicates }}</span>
                    <span class="text-muted-foreground text-sm">{{ t("import.preview.stats.duplicates") }}</span>
                </div>
                <div v-if="stats.dbDups > 0" class="flex items-center gap-2">
                    <Icon class="h-4 w-4 text-red-500" name="iconoir:database" />
                    <span class="font-medium text-red-600 dark:text-red-400">{{ stats.dbDups }}</span>
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
        <ScrollArea class="min-h-0 flex-1 overflow-hidden" scrollbar-class="pt-[41px]">
            <Table wrapperClass="overflow-visible pr-3">
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
                                transaction.status === 'duplicate_internal' && 'bg-orange-500/5',
                                transaction.status === 'duplicate_db' && 'bg-red-500/5',
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
                                        'font-medium',
                                        transaction.amount > 0
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-600 dark:text-red-400',
                                    )
                                ">
                                {{ transaction.amount.toFixed(2) }}
                            </span>
                        </TableCell>
                        <TableCell>
                            <div class="flex items-center gap-1">
                                <Select
                                    :model-value="transaction.categoryId"
                                    @update:model-value="handleCategoryChange(transaction.id, $event)">
                                    <SelectTrigger class="h-8 w-full">
                                        <SelectValue :placeholder="t('transactions.form.selectCategory')">
                                            <div v-if="transaction.categoryId" class="flex items-center gap-2">
                                                <div
                                                    v-if="categoryMap.get(transaction.categoryId)"
                                                    :style="{
                                                        backgroundColor: categoryMap.get(transaction.categoryId)
                                                            ?.hexColor,
                                                    }"
                                                    class="h-3 w-3 rounded-full" />
                                                <span class="truncate">
                                                    {{ categoryMap.get(transaction.categoryId)?.name }}
                                                </span>
                                            </div>
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem :value="null as any">
                                            {{ t("common.none") }}
                                        </SelectItem>
                                        <SelectItem
                                            v-for="cat in referenceStore.categories"
                                            :key="cat.id"
                                            :value="cat.id">
                                            <div class="flex items-center gap-2">
                                                <div
                                                    :style="{backgroundColor: cat.hexColor}"
                                                    class="h-3 w-3 rounded-full" />
                                                {{ cat.name }}
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button size="icon-sm" variant="ghost" @click="openCreateCategory(transaction.id)">
                                    <Icon class="h-4 w-4" name="iconoir:plus" />
                                </Button>
                            </div>
                        </TableCell>
                        <TableCell>
                            <div class="flex items-center gap-1">
                                <Select
                                    :model-value="transaction.merchantId"
                                    @update:model-value="handleMerchantChange(transaction.id, $event)">
                                    <SelectTrigger class="h-8 w-full">
                                        <SelectValue :placeholder="t('transactions.form.selectMerchant')">
                                            {{ merchantMap.get(transaction.merchantId)?.name }}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem :value="null as any">
                                            {{ t("common.none") }}
                                        </SelectItem>
                                        <SelectItem
                                            v-for="merch in referenceStore.merchants"
                                            :key="merch.id"
                                            :value="merch.id">
                                            {{ merch.name }}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button size="icon-sm" variant="ghost" @click="openCreateMerchant(transaction.id)">
                                    <Icon class="h-4 w-4" name="iconoir:plus" />
                                </Button>
                            </div>
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

        <!-- Create Merchant Dialog -->
        <Dialog v-model:open="createMerchantDialog">
            <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{{ t("settings.references.createMerchant") }}</DialogTitle>
                    <DialogDescription>
                        {{ t("import.preview.createMerchantDescription") }}
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-4 py-4">
                    <div class="grid grid-cols-4 items-center gap-4">
                        <Label class="text-right text-sm font-medium" for="merchant-name">
                            {{ t("settings.references.name") }}
                        </Label>
                        <Input
                            id="merchant-name"
                            v-model="newMerchantName"
                            :placeholder="t('settings.references.merchantPlaceholder')"
                            class="col-span-3"
                            @keyup.enter="submitMerchant" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="createMerchantDialog = false">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="!newMerchantName.trim() || isCreatingMerchant" @click="submitMerchant">
                        <span v-if="isCreatingMerchant">{{ t("common.saving") }}</span>
                        <span v-else>{{ t("common.save") }}</span>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Create Category Dialog -->
        <Dialog v-model:open="createCategoryDialog">
            <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{{ t("settings.references.createCategory") }}</DialogTitle>
                    <DialogDescription>
                        {{ t("import.preview.createCategoryDescription") }}
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-4 py-4">
                    <div class="grid grid-cols-4 items-center gap-4">
                        <Label class="text-right text-sm font-medium" for="category-name">
                            {{ t("settings.references.name") }}
                        </Label>
                        <Input
                            id="category-name"
                            v-model="newCategoryName"
                            :placeholder="t('settings.references.categoryPlaceholder')"
                            class="col-span-3" />
                    </div>
                    <div class="grid grid-cols-4 items-start gap-4">
                        <Label class="mt-2 text-right text-sm font-medium" for="category-color">
                            {{ t("settings.references.color") }}
                        </Label>
                        <div class="col-span-3 flex flex-col gap-3">
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="color in PRESET_COLORS"
                                    :key="color"
                                    :aria-label="t('settings.references.aria.selectColor')"
                                    :class="{
                                        'ring-ring ring-offset-background ring-2 ring-offset-2':
                                            newCategoryColor === color,
                                    }"
                                    :style="{backgroundColor: color}"
                                    class="border-border h-6 w-6 rounded-full border transition-transform hover:scale-110"
                                    type="button"
                                    @click="newCategoryColor = color"></button>
                            </div>
                            <div class="flex items-center gap-2">
                                <Input
                                    id="category-color"
                                    v-model="newCategoryColor"
                                    class="h-10 w-16 cursor-pointer p-1"
                                    type="color" />
                                <Input v-model="newCategoryColor" class="uppercase" placeholder="#000000" />
                            </div>
                        </div>
                    </div>
                    <div class="grid grid-cols-4 items-start gap-4">
                        <Label class="mt-2 text-right text-sm font-medium" for="category-icon">
                            {{ t("settings.references.icon") }}
                        </Label>
                        <div class="col-span-3 flex flex-col gap-3">
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="iconName in PRESET_ICONS"
                                    :key="iconName"
                                    :aria-label="t('settings.references.aria.selectIcon')"
                                    :class="{
                                        'bg-primary text-primary-foreground hover:bg-primary':
                                            newCategoryIcon === iconName,
                                    }"
                                    class="border-border hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                                    type="button"
                                    @click="newCategoryIcon = iconName">
                                    <Icon :name="iconName" class="h-4 w-4" />
                                </button>
                            </div>
                            <div class="flex items-center gap-2">
                                <div
                                    class="border-input flex h-10 w-10 shrink-0 items-center justify-center rounded-md border">
                                    <Icon :name="newCategoryIcon" class="h-5 w-5" />
                                </div>
                                <Input id="category-icon" v-model="newCategoryIcon" placeholder="iconoir:label" />
                            </div>
                            <div class="text-muted-foreground text-xs">
                                {{ t("import.preview.findIcons") }}
                                <a
                                    class="hover:text-foreground underline"
                                    href="https://icones.js.org/collection/iconoir"
                                    target="_blank">
                                    {{ t("settings.references.iconLibrary") }}
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="createCategoryDialog = false">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="!newCategoryName.trim() || isCreatingCategory" @click="submitCategory">
                        <span v-if="isCreatingCategory">{{ t("common.saving") }}</span>
                        <span v-else>{{ t("common.save") }}</span>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
