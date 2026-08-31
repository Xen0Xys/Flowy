<script lang="ts" setup>
import {computed, ref} from "vue";
import {useI18n} from "vue-i18n";
import {Input} from "@/components/ui/input";

const props = withDefaults(
    defineProps<{
        keywords: string[];
        primaryKeyword: string | null;
        entityName: string;
        maxKeywords?: number;
        inputId?: string;
    }>(),
    {
        maxKeywords: 20,
    },
);

const emit = defineEmits<{
    (e: "update:keywords", value: string[]): void;
    (e: "update:primaryKeyword", value: string | null): void;
}>();

const {t} = useI18n();
const keywordInput = ref("");

const trimmedName = computed(() => props.entityName.trim());
const hasDefaultPrimary = computed(() => !props.primaryKeyword && trimmedName.value.length > 0);
const isAtLimit = computed(() => props.keywords.length >= props.maxKeywords);

function addKeyword() {
    const trimmed = keywordInput.value.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (props.keywords.some((k) => k.toLowerCase() === lower)) {
        keywordInput.value = "";
        return;
    }
    if (lower === trimmedName.value.toLowerCase()) {
        keywordInput.value = "";
        return;
    }
    if (isAtLimit.value) return;
    emit("update:keywords", [...props.keywords, trimmed]);
    keywordInput.value = "";
}

function removeKeyword(keyword: string) {
    emit(
        "update:keywords",
        props.keywords.filter((k) => k !== keyword),
    );
    if (props.primaryKeyword === keyword) {
        emit("update:primaryKeyword", null);
    }
}

function togglePrimary(keyword: string) {
    if (props.primaryKeyword === keyword) {
        emit("update:primaryKeyword", null);
    } else {
        emit("update:primaryKeyword", keyword);
    }
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addKeyword();
        return;
    }
    if (event.key === "Backspace" && !keywordInput.value && props.keywords.length > 0) {
        const last = props.keywords[props.keywords.length - 1];
        if (last) removeKeyword(last);
    }
}
</script>

<template>
    <div class="flex flex-col gap-2">
        <div v-if="hasDefaultPrimary || keywords.length" class="flex flex-wrap gap-1.5">
            <span
                v-if="hasDefaultPrimary"
                class="border-primary/20 bg-primary/10 text-primary inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium">
                <Icon class="h-3 w-3 shrink-0" name="iconoir:star-solid" />
                <span class="truncate">{{ trimmedName }}</span>
                <span class="text-primary/70 shrink-0 text-[10px] font-normal">
                    {{ t("settings.references.keywordsField.defaultLabel") }}
                </span>
            </span>
            <span
                v-for="keyword in keywords"
                :key="keyword"
                class="border-border inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs"
                :class="
                    primaryKeyword === keyword
                        ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                        : 'bg-muted/50 text-foreground'
                ">
                <button
                    type="button"
                    class="focus-visible:ring-ring shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    :class="primaryKeyword === keyword ? 'text-primary' : 'text-muted-foreground hover:text-primary'"
                    :aria-label="
                        primaryKeyword === keyword
                            ? t('settings.references.keywordsField.unsetPrimary')
                            : t('settings.references.keywordsField.markAsPrimary')
                    "
                    :title="
                        primaryKeyword === keyword
                            ? t('settings.references.keywordsField.unsetPrimary')
                            : t('settings.references.keywordsField.markAsPrimary')
                    "
                    @click="togglePrimary(keyword)">
                    <Icon :name="primaryKeyword === keyword ? 'iconoir:star-solid' : 'iconoir:star'" class="h-3 w-3" />
                </button>
                <span class="truncate">{{ keyword }}</span>
                <button
                    type="button"
                    class="hover:text-destructive focus-visible:ring-ring shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    :aria-label="t('settings.references.aria.removeKeyword')"
                    @click="removeKeyword(keyword)">
                    <Icon class="h-3 w-3" name="iconoir:xmark" />
                </button>
            </span>
        </div>

        <Input
            :id="inputId"
            v-model="keywordInput"
            :disabled="isAtLimit"
            :placeholder="
                isAtLimit
                    ? t('settings.references.keywordsField.limitReached', {max: maxKeywords})
                    : t('settings.references.keywordsPlaceholder')
            "
            @keydown="handleKeydown"
            @blur="addKeyword" />

        <p class="text-muted-foreground text-xs leading-relaxed">
            {{ t("settings.references.keywordsField.help") }}
        </p>
    </div>
</template>
