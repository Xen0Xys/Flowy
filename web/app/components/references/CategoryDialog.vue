<script lang="ts" setup>
import type {TransactionCategory} from "~/stores/transaction.store";

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
});

const isLoading = ref(false);

// Reset form when dialog opens
watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            if (props.category) {
                form.value = {
                    name: props.category.name,
                    hexColor: props.category.hexColor,
                    icon: props.category.icon,
                };
            } else {
                form.value = {
                    name: "",
                    hexColor: "#ef4444",
                    icon: "iconoir:label",
                };
            }
        }
    },
);

async function handleSubmit() {
    if (!form.value.name.trim()) return;

    isLoading.value = true;
    try {
        let result: TransactionCategory;
        if (props.category) {
            result = await referenceStore.updateCategory(props.category.id, form.value);
        } else {
            result = await referenceStore.createCategory(form.value);
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
                    {{ category ? "Make changes to your category." : "Add a new category for your transactions." }}
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
                    <Label class="mt-2 text-right text-sm font-medium">
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
                                aria-label="Select color" />
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-4 items-start gap-4">
                    <Label class="mt-2 text-right text-sm font-medium">
                        {{ t("settings.references.icon") }}
                    </Label>
                    <div class="col-span-3 flex flex-wrap gap-2">
                        <button
                            v-for="iconName in PRESET_ICONS"
                            :key="iconName"
                            type="button"
                            class="border-border hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                            :class="{
                                'bg-primary text-primary-foreground hover:bg-primary': form.icon === iconName,
                            }"
                            @click="form.icon = iconName"
                            aria-label="Select icon">
                            <Icon :name="iconName" class="h-4 w-4" />
                        </button>
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
