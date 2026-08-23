<script lang="ts" setup>
import type {TransactionMerchant} from "~/stores/transaction.store";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Switch} from "~/components/ui/switch";

const props = defineProps<{
    open: boolean;
    merchant?: TransactionMerchant | null;
}>();

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "saved", merchant: TransactionMerchant): void;
}>();

const {t} = useI18n();
const referenceStore = useReferenceStore();

const PRIMARY_DEFAULT_SENTINEL = "__default__";

const form = ref({
    name: "",
    keywords: [] as string[],
    primaryKeyword: null as string | null,
    autoCompleteEnabled: true,
});

const keywordInput = ref("");
const isLoading = ref(false);

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
            if (props.merchant) {
                form.value = {
                    name: props.merchant.name,
                    keywords: [...(props.merchant.keywords ?? [])],
                    primaryKeyword: props.merchant.primaryKeyword ?? null,
                    autoCompleteEnabled: props.merchant.autoCompleteEnabled ?? true,
                };
            } else {
                form.value = {
                    name: "",
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
            keywords: form.value.keywords,
            primaryKeyword: form.value.primaryKeyword,
            autoCompleteEnabled: form.value.autoCompleteEnabled,
        };
        let result: TransactionMerchant;
        if (props.merchant) {
            result = await referenceStore.updateMerchant(props.merchant.id, payload);
        } else {
            result = await referenceStore.createMerchant(payload);
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
                    {{ merchant ? t("settings.references.editMerchant") : t("settings.references.createMerchant") }}
                </DialogTitle>
                <DialogDescription>
                    {{
                        merchant
                            ? t("settings.references.editMerchantDescription")
                            : t("settings.references.createMerchantDescription")
                    }}
                </DialogDescription>
            </DialogHeader>
            <div class="grid gap-4 py-4">
                <div class="grid grid-cols-4 items-center gap-4">
                    <Label for="merchant-name" class="text-right text-sm font-medium">
                        {{ t("settings.references.name") }}
                    </Label>
                    <Input
                        id="merchant-name"
                        v-model="form.name"
                        class="col-span-3"
                        :placeholder="t('import.preview.merchantPlaceholder')" />
                </div>

                <div class="grid grid-cols-4 items-start gap-4">
                    <Label class="mt-2 text-right text-sm font-medium" for="merchant-keywords">
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
                                id="merchant-keywords"
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
                    <Label class="mt-2 text-right text-sm font-medium" for="merchant-primary">
                        {{ t("settings.references.primaryKeyword") }}
                    </Label>
                    <div class="col-span-3 flex flex-col gap-2">
                        <Select :model-value="primaryOptionValue" @update:model-value="handlePrimaryChange">
                            <SelectTrigger id="merchant-primary">
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
                    <Label class="text-right text-sm font-medium" for="merchant-autocomplete">
                        {{ t("settings.references.autoComplete") }}
                    </Label>
                    <div class="col-span-3 flex items-center gap-2">
                        <Switch id="merchant-autocomplete" v-model="form.autoCompleteEnabled" />
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
