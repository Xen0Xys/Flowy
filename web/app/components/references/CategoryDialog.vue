<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import type {TransactionCategory} from "~/stores/transaction.store";
import {useReferenceStore} from "~/stores/reference.store";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";
import {Switch} from "@/components/ui/switch";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import IconPicker from "~/components/references/IconPicker.vue";
import ReferenceKeywordsField from "~/components/references/ReferenceKeywordsField.vue";

const props = defineProps<{
    open: boolean;
    category?: TransactionCategory | null;
}>();

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "saved", category: TransactionCategory): void;
}>();

const {t} = useI18n();
const referenceStore = useReferenceStore();

const PRESET_COLORS = [
    "#ef4444",
    "#f43f5e",
    "#ec4899",
    "#d946ef",
    "#a855f7",
    "#8b5cf6",
    "#6366f1",
    "#3b82f6",
    "#0ea5e9",
    "#06b6d4",
    "#14b8a6",
    "#10b981",
    "#22c55e",
    "#84cc16",
    "#ca8a04",
    "#f59e0b",
    "#f97316",
    "#78716c",
    "#6b7280",
    "#64748b",
];

const HEX_PATTERN = /^#([0-9a-fA-F]{6})$/;

const form = ref({
    name: "",
    hexColor: "#ef4444",
    icon: "iconoir:label",
    keywords: [] as string[],
    primaryKeyword: null as string | null,
    autoCompleteEnabled: true,
});

const isLoading = ref(false);
const nameTouched = ref(false);

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            nameTouched.value = false;
            if (props.category) {
                form.value = {
                    name: props.category.name,
                    hexColor: props.category.hexColor,
                    icon: props.category.icon,
                    keywords: [...(props.category.keywords ?? [])],
                    primaryKeyword: props.category.primaryKeyword ?? null,
                    autoCompleteEnabled: props.category.autoCompleteEnabled ?? true,
                };
            } else {
                form.value = {
                    name: "",
                    hexColor: "#ef4444",
                    icon: "iconoir:label",
                    keywords: [],
                    primaryKeyword: null,
                    autoCompleteEnabled: true,
                };
            }
        }
    },
);

const trimmedName = computed(() => form.value.name.trim());
const hasName = computed(() => trimmedName.value.length > 0);
const isValidHex = computed(() => HEX_PATTERN.test(form.value.hexColor));

const duplicateName = computed(() => {
    if (!hasName.value) return false;
    const lower = trimmedName.value.toLowerCase();
    return referenceStore.categories.some((c) => c.name.trim().toLowerCase() === lower && c.id !== props.category?.id);
});

const nameError = computed(() => {
    if (!nameTouched.value) return null;
    if (!hasName.value) return t("settings.references.errors.nameRequired");
    if (duplicateName.value) return t("settings.references.errors.categoryDuplicate");
    return null;
});

const previewName = computed(() => trimmedName.value || t("settings.references.preview.placeholder"));

const canSave = computed(() => hasName.value && isValidHex.value && !duplicateName.value && !isLoading.value);

const saveDisabledReason = computed(() => {
    if (isLoading.value) return null;
    if (!hasName.value) return t("settings.references.errors.nameRequired");
    if (!isValidHex.value) return t("settings.references.errors.invalidHex");
    if (duplicateName.value) return t("settings.references.errors.categoryDuplicate");
    return null;
});

async function handleSubmit() {
    if (!canSave.value) return;

    isLoading.value = true;
    try {
        const payload = {
            name: trimmedName.value,
            hexColor: form.value.hexColor,
            icon: form.value.icon.trim() || "iconoir:label",
            keywords: form.value.keywords,
            primaryKeyword: form.value.primaryKeyword,
            autoCompleteEnabled: form.value.autoCompleteEnabled,
        };
        let result: TransactionCategory;
        if (props.category) {
            result = await referenceStore.updateCategory(props.category.id, payload);
        } else {
            result = await referenceStore.createCategory(payload);
        }
        emit("saved", result);
        emit("update:open", false);
    } finally {
        isLoading.value = false;
    }
}

function handleClose(value: boolean) {
    emit("update:open", value);
}
</script>

<template>
    <Dialog :open="open" @update:open="handleClose">
        <DialogContent class="gap-0 p-0 sm:max-w-[480px]">
            <DialogHeader class="border-border/60 flex-row items-start gap-3 border-b p-5 pr-12">
                <div class="relative shrink-0">
                    <span aria-hidden="true" class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
                    <div
                        class="bg-brand-gradient-soft border-border/60 relative flex size-10 items-center justify-center rounded-xl border">
                        <Icon class="text-primary size-5" name="iconoir:label" />
                    </div>
                </div>
                <div class="flex flex-1 flex-col gap-1 text-left">
                    <DialogTitle class="font-heading text-base tracking-tight">
                        {{ category ? t("settings.references.editCategory") : t("settings.references.createCategory") }}
                    </DialogTitle>
                    <DialogDescription class="text-muted-foreground text-xs">
                        {{
                            category
                                ? t("settings.references.editCategoryDescription")
                                : t("settings.references.createCategoryDescription")
                        }}
                    </DialogDescription>
                </div>
            </DialogHeader>

            <div class="flex max-h-[calc(85vh-9rem)] flex-col gap-5 overflow-y-auto px-5 py-5">
                <div
                    class="border-border/60 bg-muted/30 flex items-center gap-3 rounded-lg border border-dashed p-3"
                    :aria-label="t('settings.references.preview.title')">
                    <div
                        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors"
                        :style="{
                            backgroundColor: (isValidHex ? form.hexColor : '#64748b') + '20',
                            color: isValidHex ? form.hexColor : '#64748b',
                        }">
                        <Icon :name="form.icon" class="h-5 w-5" />
                    </div>
                    <div class="flex min-w-0 flex-1 flex-col">
                        <span class="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                            {{ t("settings.references.preview.title") }}
                        </span>
                        <span class="text-foreground truncate text-sm font-medium">{{ previewName }}</span>
                    </div>
                </div>

                <div class="flex flex-col gap-2">
                    <Label for="category-name" class="text-sm font-medium">
                        {{ t("settings.references.name") }}
                    </Label>
                    <Input
                        id="category-name"
                        v-model="form.name"
                        autocomplete="off"
                        :placeholder="t('import.preview.categoryPlaceholder')"
                        :aria-invalid="nameError ? true : undefined"
                        @blur="nameTouched = true" />
                    <p v-if="nameError" class="text-destructive text-xs">{{ nameError }}</p>
                </div>

                <div class="flex flex-col gap-2">
                    <Label class="text-sm font-medium">{{ t("settings.references.style") }}</Label>
                    <div class="border-border/60 flex items-center gap-3 rounded-lg border p-3">
                        <IconPicker v-model="form.icon" />
                        <Separator orientation="vertical" class="h-10" />
                        <div class="grid flex-1 grid-cols-10 gap-1.5">
                            <button
                                v-for="color in PRESET_COLORS"
                                :key="color"
                                type="button"
                                class="border-border/60 focus-visible:ring-ring h-6 w-6 rounded-full border transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                :class="{
                                    'ring-foreground ring-offset-background ring-2 ring-offset-1':
                                        form.hexColor === color,
                                }"
                                :style="{backgroundColor: color}"
                                :aria-label="t('settings.references.aria.selectColor')"
                                @click="form.hexColor = color" />
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <Input
                            v-model="form.hexColor"
                            class="h-8 w-10 shrink-0 cursor-pointer p-1"
                            type="color"
                            :aria-label="t('settings.references.aria.selectColor')" />
                        <Input
                            v-model="form.hexColor"
                            class="h-8 flex-1 font-mono text-xs uppercase"
                            placeholder="#000000"
                            :aria-invalid="!isValidHex ? true : undefined"
                            :aria-label="t('settings.references.aria.hexColorInput')" />
                    </div>
                    <p v-if="!isValidHex" class="text-destructive text-xs">
                        {{ t("settings.references.errors.invalidHex") }}
                    </p>
                </div>

                <div class="flex flex-col gap-2">
                    <Label for="category-keywords" class="text-sm font-medium">
                        {{ t("settings.references.keywords") }}
                    </Label>
                    <ReferenceKeywordsField
                        v-model:keywords="form.keywords"
                        v-model:primary-keyword="form.primaryKeyword"
                        :entity-name="form.name"
                        :input-id="'category-keywords'" />
                </div>

                <Separator />

                <div class="flex items-start justify-between gap-4">
                    <div class="flex flex-col gap-0.5">
                        <Label for="category-autocomplete" class="text-sm font-medium">
                            {{ t("settings.references.autoComplete") }}
                        </Label>
                        <span class="text-muted-foreground text-xs">
                            {{ t("settings.references.autoCompleteHelp") }}
                        </span>
                    </div>
                    <Switch id="category-autocomplete" v-model="form.autoCompleteEnabled" class="mt-0.5 shrink-0" />
                </div>
            </div>

            <DialogFooter class="border-border/60 border-t p-4">
                <Button variant="outline" type="button" @click="handleClose(false)">
                    {{ t("common.cancel") }}
                </Button>
                <TooltipProvider :delay-duration="200">
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <span :class="{'cursor-not-allowed': !canSave}">
                                <Button :disabled="!canSave" type="button" @click="handleSubmit">
                                    <span v-if="isLoading">{{ t("common.saving") }}</span>
                                    <span v-else>{{ t("common.save") }}</span>
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent v-if="saveDisabledReason" side="top">
                            {{ saveDisabledReason }}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
