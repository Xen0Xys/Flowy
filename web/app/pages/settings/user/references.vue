<script lang="ts" setup>
import {computed, nextTick, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useReferenceStore} from "~/stores/reference.store";
import {Card, CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {Checkbox} from "@/components/ui/checkbox";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {Edit, MoreHorizontal, Trash2} from "lucide-vue-next";
import CategoryDialog from "~/components/references/CategoryDialog.vue";
import MerchantDialog from "~/components/references/MerchantDialog.vue";
import type {TransactionCategory, TransactionMerchant} from "~/stores/transaction.store";
import {Icon} from "#components";

const referenceStore = useReferenceStore();
const {t} = useI18n();

const activeTab = ref<"categories" | "merchants">("categories");
const searchQuery = ref("");

onMounted(async () => {
    await referenceStore.fetchReferences();
});

const categoryDialogOpen = ref(false);
const editingCategory = ref<TransactionCategory | null>(null);
const deletingCategoryId = ref<string | null>(null);
const deleteCategoryDialogTarget = ref<TransactionCategory | null>(null);

const merchantDialogOpen = ref(false);
const editingMerchant = ref<TransactionMerchant | null>(null);
const deletingMerchantId = ref<string | null>(null);
const deleteMerchantDialogTarget = ref<TransactionMerchant | null>(null);

const selectedCategoryIds = ref<Set<string>>(new Set());
const selectedMerchantIds = ref<Set<string>>(new Set());

const bulkDeleteCategoriesDialogOpen = ref(false);
const bulkDeleteMerchantsDialogOpen = ref(false);
const isBulkDeletingCategories = ref(false);
const isBulkDeletingMerchants = ref(false);

const selectedCategoryCountLabel = computed(() =>
    t("settings.references.selectedCount", selectedCategoryIds.value.size, {
        named: {count: selectedCategoryIds.value.size},
    }),
);
const selectedMerchantCountLabel = computed(() =>
    t("settings.references.selectedCount", selectedMerchantIds.value.size, {
        named: {count: selectedMerchantIds.value.size},
    }),
);
const bulkDeleteCategoriesTitle = computed(() =>
    t("settings.references.bulkDeleteCategoriesTitle", selectedCategoryIds.value.size, {
        named: {count: selectedCategoryIds.value.size},
    }),
);
const bulkDeleteCategoriesDescription = computed(() =>
    t("settings.references.bulkDeleteCategoriesDescription", selectedCategoryIds.value.size, {
        named: {count: selectedCategoryIds.value.size},
    }),
);
const bulkDeleteMerchantsTitle = computed(() =>
    t("settings.references.bulkDeleteMerchantsTitle", selectedMerchantIds.value.size, {
        named: {count: selectedMerchantIds.value.size},
    }),
);
const bulkDeleteMerchantsDescription = computed(() =>
    t("settings.references.bulkDeleteMerchantsDescription", selectedMerchantIds.value.size, {
        named: {count: selectedMerchantIds.value.size},
    }),
);

const filteredCategories = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return referenceStore.categories;
    return referenceStore.categories.filter((c) => c.name.toLowerCase().includes(query));
});

const filteredMerchants = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return referenceStore.merchants;
    return referenceStore.merchants.filter((m) => m.name.toLowerCase().includes(query));
});

const searchPlaceholder = computed(() =>
    activeTab.value === "categories"
        ? t("settings.references.searchCategoriesPlaceholder")
        : t("settings.references.searchMerchantsPlaceholder"),
);

type HeaderCheckboxState = boolean | "indeterminate";

function headerState(filteredIds: string[], selected: Set<string>): HeaderCheckboxState {
    if (filteredIds.length === 0) return false;
    let selectedCount = 0;
    for (const id of filteredIds) {
        if (selected.has(id)) selectedCount++;
    }
    if (selectedCount === 0) return false;
    if (selectedCount === filteredIds.length) return true;
    return "indeterminate";
}

const categoryHeaderState = computed<HeaderCheckboxState>(() =>
    headerState(
        filteredCategories.value.map((c) => c.id),
        selectedCategoryIds.value,
    ),
);

const merchantHeaderState = computed<HeaderCheckboxState>(() =>
    headerState(
        filteredMerchants.value.map((m) => m.id),
        selectedMerchantIds.value,
    ),
);

function toggleAllFilteredCategories(value: boolean | "indeterminate") {
    const filteredIds = filteredCategories.value.map((c) => c.id);
    const next = new Set(selectedCategoryIds.value);
    if (value === true) {
        for (const id of filteredIds) next.add(id);
    } else {
        for (const id of filteredIds) next.delete(id);
    }
    selectedCategoryIds.value = next;
}

function toggleCategory(id: string, value: boolean | "indeterminate") {
    const next = new Set(selectedCategoryIds.value);
    if (value === true) next.add(id);
    else next.delete(id);
    selectedCategoryIds.value = next;
}

function toggleAllFilteredMerchants(value: boolean | "indeterminate") {
    const filteredIds = filteredMerchants.value.map((m) => m.id);
    const next = new Set(selectedMerchantIds.value);
    if (value === true) {
        for (const id of filteredIds) next.add(id);
    } else {
        for (const id of filteredIds) next.delete(id);
    }
    selectedMerchantIds.value = next;
}

function toggleMerchant(id: string, value: boolean | "indeterminate") {
    const next = new Set(selectedMerchantIds.value);
    if (value === true) next.add(id);
    else next.delete(id);
    selectedMerchantIds.value = next;
}

function clearCategorySelection() {
    selectedCategoryIds.value = new Set();
}

function clearMerchantSelection() {
    selectedMerchantIds.value = new Set();
}

watch(activeTab, () => {
    clearCategorySelection();
    clearMerchantSelection();
    searchQuery.value = "";
});

function openCategoryDialog(category?: TransactionCategory) {
    editingCategory.value = category ?? null;
    categoryDialogOpen.value = true;
}

function requestDeleteCategory(category: TransactionCategory) {
    nextTick(() => {
        deleteCategoryDialogTarget.value = category;
    });
}

async function confirmDeleteCategory() {
    const target = deleteCategoryDialogTarget.value;
    if (!target) return;
    deletingCategoryId.value = target.id;
    try {
        await referenceStore.deleteCategory(target.id);
        toggleCategory(target.id, false);
        deleteCategoryDialogTarget.value = null;
    } finally {
        deletingCategoryId.value = null;
    }
}

async function confirmBulkDeleteCategories() {
    const ids = Array.from(selectedCategoryIds.value);
    if (!ids.length) return;
    isBulkDeletingCategories.value = true;
    try {
        await referenceStore.bulkDeleteCategories(ids);
        clearCategorySelection();
        bulkDeleteCategoriesDialogOpen.value = false;
    } finally {
        isBulkDeletingCategories.value = false;
    }
}

function openMerchantDialog(merchant?: TransactionMerchant) {
    editingMerchant.value = merchant ?? null;
    merchantDialogOpen.value = true;
}

function requestDeleteMerchant(merchant: TransactionMerchant) {
    nextTick(() => {
        deleteMerchantDialogTarget.value = merchant;
    });
}

async function confirmDeleteMerchant() {
    const target = deleteMerchantDialogTarget.value;
    if (!target) return;
    deletingMerchantId.value = target.id;
    try {
        await referenceStore.deleteMerchant(target.id);
        toggleMerchant(target.id, false);
        deleteMerchantDialogTarget.value = null;
    } finally {
        deletingMerchantId.value = null;
    }
}

async function confirmBulkDeleteMerchants() {
    const ids = Array.from(selectedMerchantIds.value);
    if (!ids.length) return;
    isBulkDeletingMerchants.value = true;
    try {
        await referenceStore.bulkDeleteMerchants(ids);
        clearMerchantSelection();
        bulkDeleteMerchantsDialogOpen.value = false;
    } finally {
        isBulkDeletingMerchants.value = false;
    }
}
</script>

<template>
    <div class="w-full">
        <div class="mx-auto flex h-[calc(100dvh-4rem-1.5rem)] w-full max-w-6xl flex-col py-6">
            <div class="mb-6 flex shrink-0 items-center gap-3">
                <div class="relative">
                    <span aria-hidden="true" class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
                    <div
                        class="bg-brand-gradient-soft border-border/60 relative flex size-12 items-center justify-center rounded-xl border">
                        <Icon class="text-primary size-6" name="iconoir:book" />
                    </div>
                </div>
                <div>
                    <h1 class="font-heading text-2xl font-semibold tracking-tight">
                        {{ t("settings.references.title") }}
                    </h1>
                    <p class="text-muted-foreground text-sm">{{ t("settings.references.subtitle") }}</p>
                </div>
            </div>

            <Tabs v-model="activeTab" class="flex min-h-0 flex-1 flex-col gap-4">
                <div class="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <TabsList>
                        <TabsTrigger value="categories" class="gap-2">
                            {{ t("settings.references.categories") }}
                            <Badge variant="secondary" class="ml-0.5">
                                {{ referenceStore.categories.length }}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="merchants" class="gap-2">
                            {{ t("settings.references.merchants") }}
                            <Badge variant="secondary" class="ml-0.5">
                                {{ referenceStore.merchants.length }}
                            </Badge>
                        </TabsTrigger>
                    </TabsList>
                    <Button v-if="activeTab === 'categories'" size="sm" @click="openCategoryDialog()">
                        <Icon class="size-4" name="iconoir:plus" />
                        {{ t("settings.references.addCategory") }}
                    </Button>
                    <Button v-else-if="activeTab === 'merchants'" size="sm" @click="openMerchantDialog()">
                        <Icon class="size-4" name="iconoir:plus" />
                        {{ t("settings.references.addMerchant") }}
                    </Button>
                </div>

                <TabsContent value="categories" class="mt-0 flex min-h-0 flex-1 flex-col">
                    <Card
                        v-if="referenceStore.categories.length === 0"
                        class="flex min-h-0 flex-1 flex-col items-center justify-center">
                        <CardContent class="flex flex-col items-center gap-3 py-12 text-center">
                            <div class="bg-muted flex size-14 items-center justify-center rounded-full">
                                <Icon class="text-muted-foreground size-6" name="iconoir:folder" />
                            </div>
                            <div class="space-y-1">
                                <p class="font-medium">{{ t("settings.references.emptyCategoriesTitle") }}</p>
                                <p class="text-muted-foreground text-sm">
                                    {{ t("settings.references.emptyCategoriesDescription") }}
                                </p>
                            </div>
                            <Button size="sm" @click="openCategoryDialog()">
                                <Icon class="size-4" name="iconoir:plus" />
                                {{ t("settings.references.createFirstCategory") }}
                            </Button>
                        </CardContent>
                    </Card>

                    <div
                        v-else
                        class="bg-card text-card-foreground flex min-h-0 flex-1 flex-col rounded-xl border shadow-sm">
                        <div class="flex shrink-0 items-center gap-2 p-4">
                            <div class="relative flex-1">
                                <Icon
                                    class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                                    name="iconoir:search" />
                                <Input v-model="searchQuery" class="pl-9" :placeholder="searchPlaceholder" />
                            </div>
                        </div>

                        <div
                            v-if="selectedCategoryIds.size === 0"
                            class="text-muted-foreground bg-muted/30 flex shrink-0 items-center gap-2 border-t px-4 py-2.5 text-xs md:text-sm">
                            <Icon class="size-4" name="iconoir:folder" />
                            <span class="tabular-nums">
                                {{ t("settings.references.categoriesCount", filteredCategories.length) }}
                            </span>
                        </div>
                        <div
                            v-else
                            class="bg-muted/40 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
                            <span class="text-sm font-medium tabular-nums">
                                {{ selectedCategoryCountLabel }}
                            </span>
                            <div class="flex items-center gap-2">
                                <Button size="sm" variant="ghost" @click="clearCategorySelection">
                                    {{ t("settings.references.clearSelection") }}
                                </Button>
                                <Button
                                    :disabled="isBulkDeletingCategories"
                                    size="sm"
                                    variant="destructive"
                                    @click="bulkDeleteCategoriesDialogOpen = true">
                                    <Trash2 class="size-4" />
                                    {{ t("settings.references.bulkDelete") }}
                                </Button>
                            </div>
                        </div>

                        <ScrollArea class="min-h-0 flex-1 overflow-hidden rounded-b-xl border-t">
                            <Table>
                                <TableHeader class="bg-muted sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))]">
                                    <TableRow>
                                        <TableHead class="w-10">
                                            <Checkbox
                                                :aria-label="t('settings.references.selectAll')"
                                                :disabled="filteredCategories.length === 0"
                                                :model-value="categoryHeaderState"
                                                @update:model-value="toggleAllFilteredCategories" />
                                        </TableHead>
                                        <TableHead>{{ t("settings.references.name") }}</TableHead>
                                        <TableHead class="w-14 text-right"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow
                                        v-for="category in filteredCategories"
                                        :key="category.id"
                                        class="hover:bg-muted/50 cursor-pointer"
                                        :data-state="selectedCategoryIds.has(category.id) ? 'selected' : undefined"
                                        @click="openCategoryDialog(category)">
                                        <TableCell class="w-10" @click.stop>
                                            <Checkbox
                                                :aria-label="t('settings.references.selectRow')"
                                                :model-value="selectedCategoryIds.has(category.id)"
                                                @update:model-value="(v) => toggleCategory(category.id, v)" />
                                        </TableCell>
                                        <TableCell>
                                            <div class="flex items-center gap-3">
                                                <div
                                                    :style="{
                                                        backgroundColor: category.hexColor + '20',
                                                        color: category.hexColor,
                                                    }"
                                                    class="flex size-8 shrink-0 items-center justify-center rounded-md">
                                                    <Icon :name="category.icon" class="size-4" />
                                                </div>
                                                <span class="font-medium">{{ category.name }}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell class="text-right" @click.stop>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        :aria-label="t('common.actions')"
                                                        class="size-8 p-0"
                                                        size="icon"
                                                        variant="ghost">
                                                        <MoreHorizontal class="size-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" class="w-40">
                                                    <DropdownMenuItem @click="openCategoryDialog(category)">
                                                        <Edit class="size-4" />
                                                        {{ t("common.edit") }}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        :disabled="deletingCategoryId === category.id"
                                                        variant="destructive"
                                                        @click="requestDeleteCategory(category)">
                                                        <Trash2 class="size-4" />
                                                        {{ t("common.delete") }}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow v-if="filteredCategories.length === 0">
                                        <TableCell :colspan="3" class="text-muted-foreground h-24 text-center">
                                            {{ t("settings.references.noSearchResults") }}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </div>
                </TabsContent>

                <TabsContent value="merchants" class="mt-0 flex min-h-0 flex-1 flex-col">
                    <Card
                        v-if="referenceStore.merchants.length === 0"
                        class="flex min-h-0 flex-1 flex-col items-center justify-center">
                        <CardContent class="flex flex-col items-center gap-3 py-12 text-center">
                            <div class="bg-muted flex size-14 items-center justify-center rounded-full">
                                <Icon class="text-muted-foreground size-6" name="iconoir:shop" />
                            </div>
                            <div class="space-y-1">
                                <p class="font-medium">{{ t("settings.references.emptyMerchantsTitle") }}</p>
                                <p class="text-muted-foreground text-sm">
                                    {{ t("settings.references.emptyMerchantsDescription") }}
                                </p>
                            </div>
                            <Button size="sm" @click="openMerchantDialog()">
                                <Icon class="size-4" name="iconoir:plus" />
                                {{ t("settings.references.createFirstMerchant") }}
                            </Button>
                        </CardContent>
                    </Card>

                    <div
                        v-else
                        class="bg-card text-card-foreground flex min-h-0 flex-1 flex-col rounded-xl border shadow-sm">
                        <div class="flex shrink-0 items-center gap-2 p-4">
                            <div class="relative flex-1">
                                <Icon
                                    class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                                    name="iconoir:search" />
                                <Input v-model="searchQuery" class="pl-9" :placeholder="searchPlaceholder" />
                            </div>
                        </div>

                        <div
                            v-if="selectedMerchantIds.size === 0"
                            class="text-muted-foreground bg-muted/30 flex shrink-0 items-center gap-2 border-t px-4 py-2.5 text-xs md:text-sm">
                            <Icon class="size-4" name="iconoir:shop" />
                            <span class="tabular-nums">
                                {{ t("settings.references.merchantsCount", filteredMerchants.length) }}
                            </span>
                        </div>
                        <div
                            v-else
                            class="bg-muted/40 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
                            <span class="text-sm font-medium tabular-nums">
                                {{ selectedMerchantCountLabel }}
                            </span>
                            <div class="flex items-center gap-2">
                                <Button size="sm" variant="ghost" @click="clearMerchantSelection">
                                    {{ t("settings.references.clearSelection") }}
                                </Button>
                                <Button
                                    :disabled="isBulkDeletingMerchants"
                                    size="sm"
                                    variant="destructive"
                                    @click="bulkDeleteMerchantsDialogOpen = true">
                                    <Trash2 class="size-4" />
                                    {{ t("settings.references.bulkDelete") }}
                                </Button>
                            </div>
                        </div>

                        <ScrollArea class="min-h-0 flex-1 overflow-hidden rounded-b-xl border-t">
                            <Table>
                                <TableHeader class="bg-muted sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))]">
                                    <TableRow>
                                        <TableHead class="w-10">
                                            <Checkbox
                                                :aria-label="t('settings.references.selectAll')"
                                                :disabled="filteredMerchants.length === 0"
                                                :model-value="merchantHeaderState"
                                                @update:model-value="toggleAllFilteredMerchants" />
                                        </TableHead>
                                        <TableHead>{{ t("settings.references.name") }}</TableHead>
                                        <TableHead class="w-14 text-right"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow
                                        v-for="merchant in filteredMerchants"
                                        :key="merchant.id"
                                        class="hover:bg-muted/50 cursor-pointer"
                                        :data-state="selectedMerchantIds.has(merchant.id) ? 'selected' : undefined"
                                        @click="openMerchantDialog(merchant)">
                                        <TableCell class="w-10" @click.stop>
                                            <Checkbox
                                                :aria-label="t('settings.references.selectRow')"
                                                :model-value="selectedMerchantIds.has(merchant.id)"
                                                @update:model-value="(v) => toggleMerchant(merchant.id, v)" />
                                        </TableCell>
                                        <TableCell class="font-medium">{{ merchant.name }}</TableCell>
                                        <TableCell class="text-right" @click.stop>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        :aria-label="t('common.actions')"
                                                        class="size-8 p-0"
                                                        size="icon"
                                                        variant="ghost">
                                                        <MoreHorizontal class="size-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" class="w-40">
                                                    <DropdownMenuItem @click="openMerchantDialog(merchant)">
                                                        <Edit class="size-4" />
                                                        {{ t("common.edit") }}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        :disabled="deletingMerchantId === merchant.id"
                                                        variant="destructive"
                                                        @click="requestDeleteMerchant(merchant)">
                                                        <Trash2 class="size-4" />
                                                        {{ t("common.delete") }}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow v-if="filteredMerchants.length === 0">
                                        <TableCell :colspan="3" class="text-muted-foreground h-24 text-center">
                                            {{ t("settings.references.noSearchResults") }}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </div>
                </TabsContent>
            </Tabs>
        </div>

        <CategoryDialog v-model:open="categoryDialogOpen" :category="editingCategory" />
        <MerchantDialog v-model:open="merchantDialogOpen" :merchant="editingMerchant" />

        <AlertDialog
            :open="Boolean(deleteCategoryDialogTarget)"
            @update:open="(open) => !open && (deleteCategoryDialogTarget = null)">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{{ t("settings.references.deleteCategory") }}</AlertDialogTitle>
                    <AlertDialogDescription v-if="deleteCategoryDialogTarget">
                        {{
                            t("settings.references.deleteCategoryDescription", {
                                name: deleteCategoryDialogTarget.name,
                            })
                        }}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                    <Button
                        :disabled="deletingCategoryId === deleteCategoryDialogTarget?.id"
                        variant="destructive"
                        @click="confirmDeleteCategory">
                        {{ t("common.delete") }}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
            :open="Boolean(deleteMerchantDialogTarget)"
            @update:open="(open) => !open && (deleteMerchantDialogTarget = null)">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{{ t("settings.references.deleteMerchant") }}</AlertDialogTitle>
                    <AlertDialogDescription v-if="deleteMerchantDialogTarget">
                        {{
                            t("settings.references.deleteMerchantDescription", {
                                name: deleteMerchantDialogTarget.name,
                            })
                        }}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                    <Button
                        :disabled="deletingMerchantId === deleteMerchantDialogTarget?.id"
                        variant="destructive"
                        @click="confirmDeleteMerchant">
                        {{ t("common.delete") }}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
            :open="bulkDeleteCategoriesDialogOpen"
            @update:open="(open) => (bulkDeleteCategoriesDialogOpen = open)">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{{ bulkDeleteCategoriesTitle }}</AlertDialogTitle>
                    <AlertDialogDescription>{{ bulkDeleteCategoriesDescription }}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                    <Button
                        :disabled="isBulkDeletingCategories"
                        variant="destructive"
                        @click="confirmBulkDeleteCategories">
                        {{ t("common.delete") }}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
            :open="bulkDeleteMerchantsDialogOpen"
            @update:open="(open) => (bulkDeleteMerchantsDialogOpen = open)">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{{ bulkDeleteMerchantsTitle }}</AlertDialogTitle>
                    <AlertDialogDescription>{{ bulkDeleteMerchantsDescription }}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                    <Button
                        :disabled="isBulkDeletingMerchants"
                        variant="destructive"
                        @click="confirmBulkDeleteMerchants">
                        {{ t("common.delete") }}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
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
