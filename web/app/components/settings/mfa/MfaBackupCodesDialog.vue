<script lang="ts" setup>
import {ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {useMfa} from "@/composables/useMfa";
import MfaBackupCodesDisplay from "./MfaBackupCodesDisplay.vue";

type Props = {
    open: boolean;
};

const props = defineProps<Props>();
const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
}>();

const {t} = useI18n();
const {regenerateBackupCodes} = useMfa();

type Step = "form" | "display";
const step = ref<Step>("form");
const password = ref("");
const showPassword = ref(false);
const code = ref("");
const loading = ref(false);
const codes = ref<string[]>([]);

watch(
    () => props.open,
    (value) => {
        if (!value) reset();
    },
);

function reset() {
    step.value = "form";
    password.value = "";
    showPassword.value = false;
    code.value = "";
    loading.value = false;
    codes.value = [];
}

async function submit() {
    if (!password.value.trim() || !code.value.trim() || loading.value) return;
    loading.value = true;
    try {
        const generated = await regenerateBackupCodes(password.value, code.value.trim());
        codes.value = generated;
        step.value = "display";
    } catch {
        code.value = "";
    } finally {
        loading.value = false;
    }
}

function handleUpdateOpen(next: boolean) {
    if (loading.value && !next) return;
    emit("update:open", next);
}
</script>

<template>
    <Dialog :open="open" @update:open="handleUpdateOpen">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{{ t("profile.mfa.regenerate.title") }}</DialogTitle>
                <DialogDescription>
                    {{
                        step === "form"
                            ? t("profile.mfa.regenerate.description")
                            : t("profile.mfa.backupCodes.warningBody")
                    }}
                </DialogDescription>
            </DialogHeader>

            <form v-if="step === 'form'" class="space-y-3" @submit.prevent="submit">
                <div class="space-y-2">
                    <Label for="mfa-regen-password">{{ t("common.confirmPassword") }}</Label>
                    <div class="relative">
                        <Input
                            id="mfa-regen-password"
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
                    <Label for="mfa-regen-code">{{ t("profile.mfa.regenerate.codeLabel") }}</Label>
                    <Input
                        id="mfa-regen-code"
                        v-model="code"
                        :disabled="loading"
                        autocomplete="one-time-code"
                        inputmode="numeric"
                        maxlength="6"
                        placeholder="123456"
                        type="text" />
                </div>
            </form>

            <MfaBackupCodesDisplay v-else :codes="codes" />

            <DialogFooter>
                <template v-if="step === 'form'">
                    <Button :disabled="loading" type="button" variant="ghost" @click="emit('update:open', false)">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="loading || !password.trim() || !code.trim()" type="button" @click="submit">
                        <Icon v-if="loading" class="mr-1 size-4 animate-spin" name="iconoir:refresh" />
                        {{ t("profile.mfa.regenerate.action") }}
                    </Button>
                </template>
                <template v-else>
                    <Button type="button" @click="emit('update:open', false)">
                        {{ t("profile.mfa.backupCodes.done") }}
                    </Button>
                </template>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
