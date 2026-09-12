<script lang="ts" setup>
import {ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";

type Props = {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel: string;
    loading?: boolean;
    inputId?: string;
};

const props = withDefaults(defineProps<Props>(), {
    description: "",
    loading: false,
    inputId: "password-confirm-input",
});

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "confirm", password: string): void;
}>();

const {t} = useI18n();
const password = ref("");
const showPassword = ref(false);

watch(
    () => props.open,
    (value) => {
        if (!value) {
            password.value = "";
            showPassword.value = false;
        }
    },
);

function handleUpdateOpen(next: boolean) {
    if (props.loading && !next) return;
    emit("update:open", next);
}

function handleConfirm() {
    const value = password.value.trim();
    if (!value || props.loading) return;
    emit("confirm", value);
}
</script>

<template>
    <AlertDialog :open="open" @update:open="handleUpdateOpen">
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{{ title }}</AlertDialogTitle>
                <AlertDialogDescription v-if="description">{{ description }}</AlertDialogDescription>
            </AlertDialogHeader>
            <form class="space-y-2" @submit.prevent="handleConfirm">
                <Label :for="inputId">{{ t("common.confirmPassword") }}</Label>
                <div class="relative">
                    <Input
                        :id="inputId"
                        v-model="password"
                        :placeholder="t('common.currentPasswordPlaceholder')"
                        :type="showPassword ? 'text' : 'password'"
                        autocomplete="current-password"
                        class="pr-10"
                        :disabled="loading" />
                    <Button
                        :aria-label="showPassword ? t('common.hidePassword') : t('common.showPassword')"
                        class="absolute top-1/2 right-1 size-7 -translate-y-1/2"
                        size="icon"
                        type="button"
                        variant="ghost"
                        @click="showPassword = !showPassword">
                        <Icon :name="showPassword ? 'iconoir:eye-closed' : 'iconoir:eye'" class="size-4" />
                    </Button>
                </div>
            </form>
            <AlertDialogFooter>
                <AlertDialogCancel :disabled="loading">{{ t("common.cancel") }}</AlertDialogCancel>
                <Button
                    :disabled="loading || !password.trim()"
                    variant="destructive"
                    type="button"
                    @click="handleConfirm">
                    <Icon v-if="loading" class="size-4 animate-spin" name="iconoir:refresh" />
                    {{ loading ? t("common.processing") : confirmLabel }}
                </Button>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
</template>
