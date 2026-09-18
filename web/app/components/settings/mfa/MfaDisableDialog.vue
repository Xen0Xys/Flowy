<script lang="ts" setup>
import {ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {useMfa} from "@/composables/useMfa";

type Props = {
    open: boolean;
};

const props = defineProps<Props>();
const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "disabled"): void;
}>();

const {t} = useI18n();
const {disableMfa} = useMfa();

const password = ref("");
const showPassword = ref(false);
const code = ref("");
const loading = ref(false);

watch(
    () => props.open,
    (value) => {
        if (!value) reset();
    },
);

function reset() {
    password.value = "";
    showPassword.value = false;
    code.value = "";
    loading.value = false;
}

function handleUpdateOpen(next: boolean) {
    if (loading.value && !next) return;
    emit("update:open", next);
}

async function submit() {
    if (!password.value.trim() || !code.value.trim() || loading.value) return;
    loading.value = true;
    try {
        await disableMfa(password.value, code.value.trim());
        emit("disabled");
        emit("update:open", false);
    } catch {
        code.value = "";
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <Dialog :open="open" @update:open="handleUpdateOpen">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{{ t("profile.mfa.disable.title") }}</DialogTitle>
                <DialogDescription>{{ t("profile.mfa.disable.description") }}</DialogDescription>
            </DialogHeader>
            <form class="space-y-3" @submit.prevent="submit">
                <div class="space-y-2">
                    <Label for="mfa-disable-password">{{ t("common.confirmPassword") }}</Label>
                    <div class="relative">
                        <Input
                            id="mfa-disable-password"
                            v-model="password"
                            :disabled="loading"
                            :placeholder="t('common.currentPasswordPlaceholder')"
                            :type="showPassword ? 'text' : 'password'"
                            autocomplete="current-password"
                            class="pr-10" />
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
                </div>
                <div class="space-y-2">
                    <Label for="mfa-disable-code">{{ t("profile.mfa.disable.codeLabel") }}</Label>
                    <Input
                        id="mfa-disable-code"
                        v-model="code"
                        :disabled="loading"
                        :placeholder="t('profile.mfa.disable.codePlaceholder')"
                        autocomplete="one-time-code"
                        inputmode="text"
                        type="text" />
                </div>
            </form>
            <DialogFooter>
                <Button :disabled="loading" type="button" variant="ghost" @click="emit('update:open', false)">
                    {{ t("common.cancel") }}
                </Button>
                <Button
                    :disabled="loading || !password.trim() || !code.trim()"
                    type="button"
                    variant="destructive"
                    @click="submit">
                    <Icon v-if="loading" class="mr-1 size-4 animate-spin" name="iconoir:refresh" />
                    {{ t("profile.mfa.disable.action") }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
