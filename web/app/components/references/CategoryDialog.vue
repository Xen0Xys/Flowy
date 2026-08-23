<script lang="ts" setup>
import type {TransactionCategory} from "~/stores/transaction.store";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Switch} from "~/components/ui/switch";

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
    "#f97316",
    "#f59e0b",
    "#ca8a04",
    "#84cc16",
    "#22c55e",
    "#10b981",
    "#14b8a6",
    "#06b6d4",
    "#0ea5e9",
    "#3b82f6",
    "#6366f1",
    "#8b5cf6",
    "#a855f7",
    "#ec4899",
    "#64748b",
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

const form = ref({
    name: "",
    hexColor: "#ef4444",
    icon: "iconoir:label",
    keywords: [] as string[],
    primaryKeyword: null as string | null,
    autoCompleteEnabled: true,
});

const keywordInput = ref("");
const isLoading = ref(false);

const PRIMARY_DEFAULT_SENTINEL = "__default__";

const primaryOptionValue = computed(() => form.value.primaryKeyword ?? PRIMARY_DEFAULT_SENTINEL);

const handlePrimaryChange = (value: string) => {
    form.value.primaryKeyword = value === PRIMARY_DEFAULT_SENTINEL ? null : value;
};

// Reset form when dialog opens
watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            keywordInput.value = "";
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

function addKeyword() {
    const trimmed = keywordInput.value.trim();
    if (!trimmed) return;
    const alreadyExists = form.value.keywords.some((k) => k.toLowerCase() === trimmed.toLowerCase());
    if (alreadyExists || trimmed.toLowerCase() === form.value.name.trim().toLowerCase()) {
        keywordInput.value = "";
        return;
    }
    if (form.value.keywords.length >= 20) return;
    form.value.keywords.push(trimmed);
    keywordInput.value = "";
}

function removeKeyword(keyword: string) {
    form.value.keywords = form.value.keywords.filter((k) => k !== keyword);
    if (form.value.primaryKeyword === keyword) {
        form.value.primaryKeyword = null;
    }
}

function handleKeywordKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addKeyword();
        return;
    }
    if (event.key === "Backspace" && !keywordInput.value && form.value.keywords.length > 0) {
        const last = form.value.keywords[form.value.keywords.length - 1];
        if (last) removeKeyword(last);
    }
}

async function handleSubmit() {
    if (!form.value.name.trim()) return;

    isLoading.value = true;
    try {
        const payload = {
            name: form.value.name,
            hexColor: form.value.hexColor,
            icon: form.value.icon,
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
        <DialogContent class="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>
                    {{ category ? t("settings.references.editCategory") : t("settings.references.createCategory") }}
                </DialogTitle>
                <DialogDescription>
                    {{
                        category
                            ? t("settings.references.editCategoryDescription")
                            : t("settings.references.createCategoryDescription")
                    }}
                </DialogDescription>
            </DialogHeader>
            <div class="grid gap-4 py-4">
                <div class="grid grid-cols-4 items-center gap-4">
                    <Label for="category-name" class="text-right text-sm font-medium">
                        {{ t("settings.references.name") }}
                    </Label>
                    <Input
                        id="category-name"
                        v-model="form.name"
                        class="col-span-3"
                        :placeholder="t('import.preview.categoryPlaceholder')" />
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
                                type="button"
                                class="border-border h-6 w-6 rounded-full border transition-transform hover:scale-110"
                                :class="{
                                    'ring-ring ring-offset-background ring-2 ring-offset-2': form.hexColor === color,
                                }"
                                :style="{backgroundColor: color}"
                                @click="form.hexColor = color"
                                :aria-label="t('settings.references.aria.selectColor')" />
                        </div>
                        <div class="flex items-center gap-2">
                            <Input
                                id="category-color"
                                v-model="form.hexColor"
                                class="h-10 w-16 cursor-pointer p-1"
                                type="color" />
                            <Input
                                v-model="form.hexColor"
                                class="uppercase"
                                placeholder="#000000"
                                :aria-label="t('settings.references.aria.hexColorInput')" />
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
                                type="button"
                                class="border-border hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                                :class="{
                                    'bg-primary text-primary-foreground hover:bg-primary': form.icon === iconName,
                                }"
                                @click="form.icon = iconName"
                                :aria-label="t('settings.references.aria.selectIcon')">
                                <Icon :name="iconName" class="h-4 w-4" />
                            </button>
                        </div>
                        <div class="flex items-center gap-2">
                            <div
                                class="border-input flex h-10 w-10 shrink-0 items-center justify-center rounded-md border">
                                <Icon :name="form.icon" class="h-5 w-5" />
                            </div>
                            <Input id="category-icon" v-model="form.icon" placeholder="iconoir:label" />
                        </div>
                        <div class="text-muted-foreground text-xs">
                            {{ t("settings.references.findIconsAt") }}
                            <a
                                class="hover:text-foreground underline"
                                href="https://icones.js.org/collection/iconoir"
                                target="_blank"
                                rel="noopener noreferrer">
                                {{ t("settings.references.iconLibrary") }}
                            </a>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-4 items-start gap-4">
                    <Label class="mt-2 text-right text-sm font-medium" for="category-keywords">
                        {{ t("settings.references.keywords") }}
                    </Label>
                    <div class="col-span-3 flex flex-col gap-2">
                        <div v-if="form.keywords.length" class="flex flex-wrap gap-1.5">
                            <span
                                v-for="keyword in form.keywords"
                                :key="keyword"
                                class="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs">
                                {{ keyword }}
                                <button
                                    type="button"
                                    class="hover:text-destructive"
                                    :aria-label="t('settings.references.aria.removeKeyword')"
                                    @click="removeKeyword(keyword)">
                                    <Icon name="iconoir:xmark" class="h-3 w-3" />
                                </button>
                            </span>
                        </div>
                        <div class="flex items-center gap-2">
                            <Input
                                id="category-keywords"
                                v-model="keywordInput"
                                :placeholder="t('settings.references.keywordsPlaceholder')"
                                @keydown="handleKeywordKeydown" />
                            <Button
                                :aria-label="t('settings.references.aria.addKeyword')"
                                :disabled="!keywordInput.trim()"
                                :title="t('settings.references.aria.addKeyword')"
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                                @click="addKeyword">
                                <Icon name="iconoir:plus" class="h-4 w-4" />
                            </Button>
                        </div>
                        <div class="text-muted-foreground text-xs">
                            {{ t("settings.references.keywordsHelp") }}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-4 items-start gap-4">
                    <Label class="mt-2 text-right text-sm font-medium" for="category-primary">
                        {{ t("settings.references.primaryKeyword") }}
                    </Label>
                    <div class="col-span-3 flex flex-col gap-2">
                        <Select :model-value="primaryOptionValue" @update:model-value="handlePrimaryChange">
                            <SelectTrigger id="category-primary">
                                <SelectValue :placeholder="t('settings.references.primaryKeywordPlaceholder')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem :value="PRIMARY_DEFAULT_SENTINEL">
                                        {{ t("settings.references.useName", {name: form.name || "..."}) }}
                                    </SelectItem>
                                    <SelectItem v-for="keyword in form.keywords" :key="keyword" :value="keyword">
                                        {{ keyword }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <div class="text-muted-foreground text-xs">
                            {{ t("settings.references.primaryKeywordHelp") }}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-4 items-center gap-4">
                    <Label class="text-right text-sm font-medium" for="category-autocomplete">
                        {{ t("settings.references.autoComplete") }}
                    </Label>
                    <div class="col-span-3 flex items-center gap-2">
                        <Switch id="category-autocomplete" v-model="form.autoCompleteEnabled" />
                        <span class="text-muted-foreground text-xs">
                            {{ t("settings.references.autoCompleteHelp") }}
                        </span>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" @click="handleClose(false)">
                    {{ t("common.cancel") }}
                </Button>
                <Button :disabled="!form.name.trim() || isLoading" @click="handleSubmit">
                    <span v-if="isLoading">{{ t("common.saving") }}</span>
                    <span v-else>{{ t("common.save") }}</span>
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
