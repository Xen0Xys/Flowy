<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import type {TransactionMerchant} from "~/stores/transaction.store";
import {useReferenceStore} from "~/stores/reference.store";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";
import {Switch} from "@/components/ui/switch";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import ReferenceKeywordsField from "~/components/references/ReferenceKeywordsField.vue";

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

const form = ref({
    name: "",
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

const trimmedName = computed(() => form.value.name.trim());
const hasName = computed(() => trimmedName.value.length > 0);

const duplicateName = computed(() => {
    if (!hasName.value) return false;
    const lower = trimmedName.value.toLowerCase();
    return referenceStore.merchants.some((m) => m.name.trim().toLowerCase() === lower && m.id !== props.merchant?.id);
});

const nameError = computed(() => {
    if (!nameTouched.value) return null;
    if (!hasName.value) return t("settings.references.errors.nameRequired");
    if (duplicateName.value) return t("settings.references.errors.merchantDuplicate");
    return null;
});

const canSave = computed(() => hasName.value && !duplicateName.value && !isLoading.value);

const saveDisabledReason = computed(() => {
    if (isLoading.value) return null;
    if (!hasName.value) return t("settings.references.errors.nameRequired");
    if (duplicateName.value) return t("settings.references.errors.merchantDuplicate");
    return null;
});

async function handleSubmit() {
    if (!canSave.value) return;

    isLoading.value = true;
    try {
        const payload = {
            name: trimmedName.value,
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
        <DialogContent class="gap-0 p-0 sm:max-w-[440px]">
            <DialogHeader class="border-border/60 flex-row items-start gap-3 border-b p-5 pr-12">
                <div class="relative shrink-0">
                    <span aria-hidden="true" class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
                    <div
                        class="bg-brand-gradient-soft border-border/60 relative flex size-10 items-center justify-center rounded-xl border">
                        <Icon class="text-primary size-5" name="iconoir:shop" />
                    </div>
                </div>
                <div class="flex flex-1 flex-col gap-1 text-left">
                    <DialogTitle class="font-heading text-base tracking-tight">
                        {{ merchant ? t("settings.references.editMerchant") : t("settings.references.createMerchant") }}
                    </DialogTitle>
                    <DialogDescription class="text-muted-foreground text-xs">
                        {{
                            merchant
                                ? t("settings.references.editMerchantDescription")
                                : t("settings.references.createMerchantDescription")
                        }}
                    </DialogDescription>
                </div>
            </DialogHeader>

            <div class="flex max-h-[calc(85vh-9rem)] flex-col gap-5 overflow-y-auto px-5 py-5">
                <div class="flex flex-col gap-2">
                    <Label for="merchant-name" class="text-sm font-medium">
                        {{ t("settings.references.name") }}
                    </Label>
                    <Input
                        id="merchant-name"
                        v-model="form.name"
                        autocomplete="off"
                        :placeholder="t('import.preview.merchantPlaceholder')"
                        :aria-invalid="nameError ? true : undefined"
                        @blur="nameTouched = true" />
                    <p v-if="nameError" class="text-destructive text-xs">{{ nameError }}</p>
                </div>

                <div class="flex flex-col gap-2">
                    <Label for="merchant-keywords" class="text-sm font-medium">
                        {{ t("settings.references.keywords") }}
                    </Label>
                    <ReferenceKeywordsField
                        v-model:keywords="form.keywords"
                        v-model:primary-keyword="form.primaryKeyword"
                        :entity-name="form.name"
                        :input-id="'merchant-keywords'" />
                </div>

                <Separator />

                <div class="flex items-start justify-between gap-4">
                    <div class="flex flex-col gap-0.5">
                        <Label for="merchant-autocomplete" class="text-sm font-medium">
                            {{ t("settings.references.autoComplete") }}
                        </Label>
                        <span class="text-muted-foreground text-xs">
                            {{ t("settings.references.autoCompleteHelp") }}
                        </span>
                    </div>
                    <Switch id="merchant-autocomplete" v-model="form.autoCompleteEnabled" class="mt-0.5 shrink-0" />
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
