<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {useReferenceStore} from "~/stores/reference.store";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type {TransactionCategory, TransactionMerchant} from "~/stores/transaction.store";
import {Icon} from "#components";

const referenceStore = useReferenceStore();
const {t} = useI18n();

const activeTab = ref("categories");

onMounted(async () => {
    await referenceStore.fetchReferences();
});

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

// Category State
const categoryDialogOpen = ref(false);
const editingCategory = ref<TransactionCategory | null>(null);
const categoryForm = ref({
    name: "",
    hexColor: "#000000",
    icon: "iconoir:label",
});
const categoryActionLoading = ref(false);
const deletingCategoryId = ref<string | null>(null);

// Merchant State
const merchantDialogOpen = ref(false);
const editingMerchant = ref<TransactionMerchant | null>(null);
const merchantForm = ref({
    name: "",
});
const merchantActionLoading = ref(false);
const deletingMerchantId = ref<string | null>(null);

// Category Methods
function openCategoryDialog(category?: TransactionCategory) {
    if (category) {
        editingCategory.value = category;
        categoryForm.value = {
            name: category.name,
            hexColor: category.hexColor,
            icon: category.icon,
        };
    } else {
        editingCategory.value = null;
        categoryForm.value = {
            name: "",
            hexColor: "#000000",
            icon: "iconoir:label",
        };
    }
    categoryDialogOpen.value = true;
}

async function saveCategory() {
    if (!categoryForm.value.name) return;

    categoryActionLoading.value = true;
    try {
        if (editingCategory.value) {
            await referenceStore.updateCategory(editingCategory.value.id, categoryForm.value);
        } else {
            await referenceStore.createCategory(categoryForm.value);
        }
        categoryDialogOpen.value = false;
    } finally {
        categoryActionLoading.value = false;
    }
}

async function deleteCategory(id: string) {
    deletingCategoryId.value = id;
    try {
        await referenceStore.deleteCategory(id);
    } finally {
        deletingCategoryId.value = null;
    }
}

// Merchant Methods
function openMerchantDialog(merchant?: TransactionMerchant) {
    if (merchant) {
        editingMerchant.value = merchant;
        merchantForm.value = {
            name: merchant.name,
        };
    } else {
        editingMerchant.value = null;
        merchantForm.value = {
            name: "",
        };
    }
    merchantDialogOpen.value = true;
}

async function saveMerchant() {
    if (!merchantForm.value.name) return;

    merchantActionLoading.value = true;
    try {
        if (editingMerchant.value) {
            await referenceStore.updateMerchant(editingMerchant.value.id, merchantForm.value);
        } else {
            await referenceStore.createMerchant(merchantForm.value);
        }
        merchantDialogOpen.value = false;
    } finally {
        merchantActionLoading.value = false;
    }
}

async function deleteMerchant(id: string) {
    deletingMerchantId.value = id;
    try {
        await referenceStore.deleteMerchant(id);
    } finally {
        deletingMerchantId.value = null;
    }
}
</script>

<template>
    <div class="w-full">
        <div class="mx-auto w-full max-w-6xl py-6">
            <div class="mb-6 flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-semibold">{{ t("settings.references.title") }}</h1>
                    <p class="text-muted-foreground text-sm">{{ t("settings.references.subtitle") }}</p>
                </div>
                <div>
                    <Button v-if="activeTab === 'categories'" @click="openCategoryDialog()">
                        <Icon class="mr-2 h-4 w-4" name="iconoir:plus" />
                        {{ t("settings.references.addCategory") }}
                    </Button>
                    <Button v-else-if="activeTab === 'merchants'" @click="openMerchantDialog()">
                        <Icon class="mr-2 h-4 w-4" name="iconoir:plus" />
                        {{ t("settings.references.addMerchant") }}
                    </Button>
                </div>
            </div>

            <Tabs v-model="activeTab" class="w-full">
                <TabsList class="mb-4">
                    <TabsTrigger value="categories">{{ t("settings.references.categories") }}</TabsTrigger>
                    <TabsTrigger value="merchants">{{ t("settings.references.merchants") }}</TabsTrigger>
                </TabsList>

                <TabsContent value="categories">
                    <Card>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead class="w-[50px]"></TableHead>
                                    <TableHead>{{ t("settings.references.name") }}</TableHead>
                                    <TableHead>{{ t("settings.references.color") }}</TableHead>
                                    <TableHead class="text-right">{{ t("common.actions") }}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow v-for="category in referenceStore.categories" :key="category.id">
                                    <TableCell>
                                        <div
                                            class="flex h-8 w-8 items-center justify-center rounded-md"
                                            :style="{
                                                backgroundColor: category.hexColor + '20',
                                                color: category.hexColor,
                                            }">
                                            <Icon :name="category.icon" class="h-4 w-4" />
                                        </div>
                                    </TableCell>
                                    <TableCell class="font-medium">{{ category.name }}</TableCell>
                                    <TableCell>
                                        <div class="flex items-center gap-2 text-sm">
                                            <div
                                                class="border-border h-4 w-4 rounded-full border"
                                                :style="{backgroundColor: category.hexColor}"></div>
                                            {{ category.hexColor }}
                                        </div>
                                    </TableCell>
                                    <TableCell class="text-right">
                                        <div class="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                @click="openCategoryDialog(category)"
                                                aria-label="Edit category">
                                                <Icon name="iconoir:edit-pencil" class="text-muted-foreground h-4 w-4" />
                                            </Button>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        :disabled="deletingCategoryId === category.id"
                                                        aria-label="Delete category">
                                                        <Icon name="iconoir:trash" class="text-destructive h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>{{
                                                            t("settings.references.deleteCategory")
                                                        }}</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Are you sure you want to delete the category "{{
                                                                category.name
                                                            }}"? Transactions using this category will lose their
                                                            association.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                                                        <AlertDialogAction @click="deleteCategory(category.id)">{{
                                                            t("common.delete")
                                                        }}</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                <TableRow v-if="referenceStore.categories.length === 0">
                                    <TableCell colspan="4" class="h-24 text-center">
                                        {{ t("settings.references.noCategories") }}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

                <TabsContent value="merchants">
                    <Card>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{{ t("settings.references.name") }}</TableHead>
                                    <TableHead class="text-right">{{ t("common.actions") }}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow v-for="merchant in referenceStore.merchants" :key="merchant.id">
                                    <TableCell class="font-medium">{{ merchant.name }}</TableCell>
                                    <TableCell class="text-right">
                                        <div class="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                @click="openMerchantDialog(merchant)"
                                                aria-label="Edit merchant">
                                                <Icon name="iconoir:edit-pencil" class="text-muted-foreground h-4 w-4" />
                                            </Button>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        :disabled="deletingMerchantId === merchant.id"
                                                        aria-label="Delete merchant">
                                                        <Icon name="iconoir:trash" class="text-destructive h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>{{
                                                            t("settings.references.deleteMerchant")
                                                        }}</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Are you sure you want to delete the merchant "{{
                                                                merchant.name
                                                            }}"? Transactions using this merchant will lose their
                                                            association.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                                                        <AlertDialogAction @click="deleteMerchant(merchant.id)">{{
                                                            t("common.delete")
                                                        }}</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                <TableRow v-if="referenceStore.merchants.length === 0">
                                    <TableCell colspan="2" class="h-24 text-center">
                                        {{ t("settings.references.noMerchants") }}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>

        <!-- Category Dialog -->
        <Dialog v-model:open="categoryDialogOpen">
            <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        {{
                            editingCategory
                                ? t("settings.references.editCategory")
                                : t("settings.references.createCategory")
                        }}
                    </DialogTitle>
                    <DialogDescription>
                        {{
                            editingCategory
                                ? "Make changes to your category."
                                : "Add a new category for your transactions."
                        }}
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-4 py-4">
                    <div class="grid grid-cols-4 items-center gap-4">
                        <label for="name" class="text-right text-sm font-medium">{{
                            t("settings.references.name")
                        }}</label>
                        <Input id="name" v-model="categoryForm.name" class="col-span-3" placeholder="e.g. Groceries" />
                    </div>
                    <div class="grid grid-cols-4 items-start gap-4">
                        <label for="color" class="mt-2 text-right text-sm font-medium">{{
                            t("settings.references.color")
                        }}</label>
                        <div class="col-span-3 flex flex-col gap-3">
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="color in PRESET_COLORS"
                                    :key="color"
                                    type="button"
                                    class="border-border h-6 w-6 rounded-full border transition-transform hover:scale-110"
                                    :class="{
                                        'ring-ring ring-offset-background ring-2 ring-offset-2':
                                            categoryForm.hexColor === color,
                                    }"
                                    :style="{backgroundColor: color}"
                                    @click="categoryForm.hexColor = color"
                                    aria-label="Select color"></button>
                            </div>
                            <div class="flex items-center gap-2">
                                <Input
                                    id="color"
                                    type="color"
                                    v-model="categoryForm.hexColor"
                                    class="h-10 w-16 cursor-pointer p-1" />
                                <Input v-model="categoryForm.hexColor" placeholder="#000000" class="uppercase" />
                            </div>
                        </div>
                    </div>
                    <div class="grid grid-cols-4 items-start gap-4">
                        <label for="icon" class="mt-2 text-right text-sm font-medium">{{
                            t("settings.references.icon")
                        }}</label>
                        <div class="col-span-3 flex flex-col gap-3">
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="iconName in PRESET_ICONS"
                                    :key="iconName"
                                    type="button"
                                    class="border-border hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                                    :class="{
                                        'bg-primary text-primary-foreground hover:bg-primary':
                                            categoryForm.icon === iconName,
                                    }"
                                    @click="categoryForm.icon = iconName"
                                    aria-label="Select icon">
                                    <Icon :name="iconName" class="h-4 w-4" />
                                </button>
                            </div>
                            <div class="flex items-center gap-2">
                                <div
                                    class="border-input flex h-10 w-10 shrink-0 items-center justify-center rounded-md border">
                                    <Icon :name="categoryForm.icon" class="h-5 w-5" />
                                </div>
                                <Input id="icon" v-model="categoryForm.icon" placeholder="iconoir:label" />
                            </div>
                            <div class="text-muted-foreground text-xs">
                                Find icons at
                                <a
                                    href="https://icones.js.org/collection/iconoir"
                                    target="_blank"
                                    class="hover:text-foreground underline"
                                    >{{ t("settings.references.iconLibrary") }}</a
                                >
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="categoryDialogOpen = false">{{ t("common.cancel") }}</Button>
                    <Button :disabled="!categoryForm.name || categoryActionLoading" @click="saveCategory">
                        <span v-if="categoryActionLoading">{{ t("common.saving") }}</span>
                        <span v-else>{{ t("common.save") }}</span>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Merchant Dialog -->
        <Dialog v-model:open="merchantDialogOpen">
            <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        {{
                            editingMerchant
                                ? t("settings.references.editMerchant")
                                : t("settings.references.createMerchant")
                        }}
                    </DialogTitle>
                    <DialogDescription>
                        {{
                            editingMerchant
                                ? "Make changes to your merchant."
                                : "Add a new merchant for your transactions."
                        }}
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-4 py-4">
                    <div class="grid grid-cols-4 items-center gap-4">
                        <label for="merchant-name" class="text-right text-sm font-medium">{{
                            t("settings.references.name")
                        }}</label>
                        <Input
                            id="merchant-name"
                            v-model="merchantForm.name"
                            class="col-span-3"
                            placeholder="e.g. Walmart" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="merchantDialogOpen = false">{{ t("common.cancel") }}</Button>
                    <Button :disabled="!merchantForm.name || merchantActionLoading" @click="saveMerchant">
                        <span v-if="merchantActionLoading">{{ t("common.saving") }}</span>
                        <span v-else>{{ t("common.save") }}</span>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
