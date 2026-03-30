<script lang="ts" setup>
import type {TransactionMerchant} from "~/stores/transaction.store";

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
});

const isLoading = ref(false);

// Reset form when dialog opens
watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            if (props.merchant) {
                form.value = {
                    name: props.merchant.name,
                };
            } else {
                form.value = {
                    name: "",
                };
            }
        }
    },
);

async function handleSubmit() {
    if (!form.value.name.trim()) return;

    isLoading.value = true;
    try {
        let result: TransactionMerchant;
        if (props.merchant) {
            result = await referenceStore.updateMerchant(props.merchant.id, form.value);
        } else {
            result = await referenceStore.createMerchant(form.value);
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
                    {{ merchant ? "Make changes to your merchant." : "Add a new merchant for your transactions." }}
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
