<script lang="ts" setup>
import {cn} from "~/lib/utils";

const props = defineProps<{
    isLoading: boolean;
}>();

const emit = defineEmits<{
    (e: "upload", file: File): void;
}>();

const {t} = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const dragCounter = ref(0);

function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
        emit("upload", file);
    }
}

function handleDragEnter(event: DragEvent) {
    event.preventDefault();
    dragCounter.value++;
    isDragging.value = true;
}

function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dragCounter.value--;
    if (dragCounter.value === 0) {
        isDragging.value = false;
    }
}

function handleDragOver(event: DragEvent) {
    event.preventDefault();
}

function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging.value = false;
    dragCounter.value = 0;

    const file = event.dataTransfer?.files[0];
    if (file) {
        emit("upload", file);
    }
}

function openFilePicker() {
    fileInput.value?.click();
}
</script>

<template>
    <div class="flex h-full items-center justify-center p-6">
        <div
            :class="
                cn(
                    'flex h-full w-full max-w-2xl flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors',
                    isDragging
                        ? 'border-primary bg-primary/5'
                        : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                    isLoading && 'pointer-events-none opacity-50',
                )
            "
            @dragenter="handleDragEnter"
            @dragleave="handleDragLeave"
            @dragover="handleDragOver"
            @drop="handleDrop">
            <Icon
                :class="cn('mb-4 h-16 w-16', isDragging ? 'text-primary' : 'text-muted-foreground')"
                name="iconoir:upload" />

            <h2 class="mb-2 text-xl font-semibold">
                {{ t("import.upload.title") }}
            </h2>

            <p class="text-muted-foreground mb-6 text-center">
                {{ t("import.upload.description") }}
            </p>

            <input ref="fileInput" accept=".csv" class="hidden" type="file" @change="handleFileSelect" />

            <Button :disabled="isLoading" size="lg" @click="openFilePicker">
                <Icon
                    :class="cn('mr-2 h-5 w-5', isLoading && 'animate-spin')"
                    :name="isLoading ? 'iconoir:refresh' : 'iconoir:cloud-upload'" />
                {{ isLoading ? t("import.upload.loading") : t("import.upload.selectFile") }}
            </Button>

            <div class="text-muted-foreground mt-6 text-center text-sm">
                <p>{{ t("import.upload.supportedFormats") }}</p>
                <p class="mt-1">{{ t("import.upload.maxRows", {max: 5000}) }}</p>
            </div>
        </div>
    </div>
</template>
