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
    (e: "registered"): void;
}>();

const {t} = useI18n();
const {registerPasskey} = useMfa();

type Step = "form" | "backup";

const step = ref<Step>("form");
const password = ref("");
const showPassword = ref(false);
const label = ref("");
const loading = ref(false);
const backupCodes = ref<string[]>([]);

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
    label.value = "";
    loading.value = false;
    backupCodes.value = [];
}

function handleUpdateOpen(next: boolean) {
    if (loading.value && step.value !== "backup") return;
    emit("update:open", next);
}

async function submit() {
    const trimmedLabel = label.value.trim();
    if (!password.value || !trimmedLabel || loading.value) return;
    loading.value = true;
    try {
        const result = await registerPasskey(password.value, trimmedLabel);
        emit("registered");
        if (result.backupCodes && result.backupCodes.length > 0) {
            backupCodes.value = result.backupCodes;
            step.value = "backup";
        } else {
            emit("update:open", false);
        }
    } catch {
        // toast handled in composable
    } finally {
        loading.value = false;
    }
}

function finish() {
    emit("update:open", false);
}
</script>

<template>
    <Dialog :open="open" @update:open="handleUpdateOpen">
        <DialogContent class="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>{{ t("profile.mfa.passkeys.register.title") }}</DialogTitle>
                <DialogDescription>
                    {{
                        step === "form"
                            ? t("profile.mfa.passkeys.register.description")
                            : t("profile.mfa.backupCodes.warningBody")
                    }}
                </DialogDescription>
            </DialogHeader>

            <form v-if="step === 'form'" class="space-y-4" @submit.prevent="submit">
                <div class="space-y-2">
                    <Label for="passkey-label">{{ t("profile.mfa.passkeys.register.labelField") }}</Label>
                    <Input
                        id="passkey-label"
                        v-model="label"
                        :disabled="loading"
                        :placeholder="t('profile.mfa.passkeys.register.labelPlaceholder')"
                        autocomplete="off"
                        maxlength="50"
                        required
                        type="text" />
                </div>
                <div class="space-y-2">
                    <Label for="passkey-password">{{ t("common.confirmPassword") }}</Label>
                    <div class="relative">
                        <Input
                            id="passkey-password"
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
            </form>

            <div v-else class="space-y-3">
                <div class="border-destructive/40 bg-destructive/5 rounded-md border p-3 text-sm">
                    <p class="text-destructive font-medium">{{ t("profile.mfa.backupCodes.warningTitle") }}</p>
                    <p class="text-muted-foreground text-xs">
                        {{ t("profile.mfa.backupCodes.warningBody") }}
                    </p>
                </div>
                <MfaBackupCodesDisplay :codes="backupCodes" />
            </div>

            <DialogFooter>
                <template v-if="step === 'form'">
                    <Button :disabled="loading" type="button" variant="ghost" @click="emit('update:open', false)">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="loading || !password || !label.trim()" type="button" @click="submit">
                        <Icon v-if="loading" class="mr-1 size-4 animate-spin" name="iconoir:refresh" />
                        {{ t("profile.mfa.passkeys.register.action") }}
                    </Button>
                </template>
                <template v-else>
                    <Button type="button" @click="finish">
                        {{ t("profile.mfa.backupCodes.done") }}
                    </Button>
                </template>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
