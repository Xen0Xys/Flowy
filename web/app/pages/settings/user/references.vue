<script lang="ts" setup>
import {onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {useReferenceStore} from "~/stores/reference.store";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
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
import CategoryDialog from "~/components/references/CategoryDialog.vue";
import MerchantDialog from "~/components/references/MerchantDialog.vue";
import type {TransactionCategory, TransactionMerchant} from "~/stores/transaction.store";
import {Icon} from "#components";

const referenceStore = useReferenceStore();
const {t} = useI18n();

const activeTab = ref("categories");

onMounted(async () => {
    await referenceStore.fetchReferences();
});

const categoryDialogOpen = ref(false);
const editingCategory = ref<TransactionCategory | null>(null);
const deletingCategoryId = ref<string | null>(null);

const merchantDialogOpen = ref(false);
const editingMerchant = ref<TransactionMerchant | null>(null);
const deletingMerchantId = ref<string | null>(null);

function openCategoryDialog(category?: TransactionCategory) {
    editingCategory.value = category ?? null;
    categoryDialogOpen.value = true;
}

async function deleteCategory(id: string) {
    deletingCategoryId.value = id;
    try {
        await referenceStore.deleteCategory(id);
    } finally {
        deletingCategoryId.value = null;
    }
}

function openMerchantDialog(merchant?: TransactionMerchant) {
    editingMerchant.value = merchant ?? null;
    merchantDialogOpen.value = true;
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
        <div class="animate-fade-in-up mx-auto w-full max-w-6xl py-6">
            <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex items-center gap-3">
                    <div class="relative">
                        <span
                            aria-hidden="true"
                            class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
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
                                    <TableHead class="w-12.5"></TableHead>
                                    <TableHead>{{ t("settings.references.name") }}</TableHead>
                                    <TableHead>{{ t("settings.references.color") }}</TableHead>
                                    <TableHead class="text-right">{{ t("common.actions") }}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow v-for="category in referenceStore.categories" :key="category.id">
                                    <TableCell>
                                        <div
                                            :style="{
                                                backgroundColor: category.hexColor + '20',
                                                color: category.hexColor,
                                            }"
                                            class="flex h-8 w-8 items-center justify-center rounded-md">
                                            <Icon :name="category.icon" class="h-4 w-4" />
                                        </div>
                                    </TableCell>
                                    <TableCell class="font-medium">{{ category.name }}</TableCell>
                                    <TableCell>
                                        <div class="flex items-center gap-2 text-sm">
                                            <div
                                                :style="{backgroundColor: category.hexColor}"
                                                class="border-border h-4 w-4 rounded-full border"></div>
                                            {{ category.hexColor }}
                                        </div>
                                    </TableCell>
                                    <TableCell class="text-right">
                                        <div class="flex justify-end gap-2">
                                            <Button
                                                :aria-label="t('settings.references.aria.editCategory')"
                                                size="icon"
                                                variant="ghost"
                                                @click="openCategoryDialog(category)">
                                                <Icon class="text-muted-foreground h-4 w-4" name="iconoir:edit-pencil" />
                                            </Button>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        :disabled="deletingCategoryId === category.id"
                                                        :aria-label="t('settings.references.aria.deleteCategory')"
                                                        size="icon"
                                                        variant="ghost">
                                                        <Icon class="text-destructive h-4 w-4" name="iconoir:trash" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>{{
                                                            t("settings.references.deleteCategory")
                                                        }}</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            {{
                                                                t("settings.references.deleteCategoryDescription", {
                                                                    name: category.name,
                                                                })
                                                            }}
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
                                    <TableCell class="h-24 text-center" colspan="4">
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
                                                :aria-label="t('settings.references.aria.editMerchant')"
                                                size="icon"
                                                variant="ghost"
                                                @click="openMerchantDialog(merchant)">
                                                <Icon class="text-muted-foreground h-4 w-4" name="iconoir:edit-pencil" />
                                            </Button>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        :disabled="deletingMerchantId === merchant.id"
                                                        :aria-label="t('settings.references.aria.deleteMerchant')"
                                                        size="icon"
                                                        variant="ghost">
                                                        <Icon class="text-destructive h-4 w-4" name="iconoir:trash" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>{{
                                                            t("settings.references.deleteMerchant")
                                                        }}</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            {{
                                                                t("settings.references.deleteMerchantDescription", {
                                                                    name: merchant.name,
                                                                })
                                                            }}
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
                                    <TableCell class="h-24 text-center" colspan="2">
                                        {{ t("settings.references.noMerchants") }}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>

        <CategoryDialog v-model:open="categoryDialogOpen" :category="editingCategory" />
        <MerchantDialog v-model:open="merchantDialogOpen" :merchant="editingMerchant" />
    </div>
</template>
