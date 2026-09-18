<script lang="ts" setup>
import {nextTick, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import QRCode from "qrcode";
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
    (e: "enabled"): void;
}>();

const {t} = useI18n();
const {setupTotp, confirmTotpSetup} = useMfa();

type Step = "password" | "scan" | "verify" | "backup";

const step = ref<Step>("password");
const password = ref("");
const showPassword = ref(false);
const code = ref("");
const loading = ref(false);
const secret = ref("");
const otpauthUrl = ref("");
const backupCodes = ref<string[]>([]);
const qrDataUrl = ref("");
const qrError = ref<string | null>(null);

watch(
    () => props.open,
    (value) => {
        if (!value) reset();
    },
);

function reset() {
    step.value = "password";
    password.value = "";
    showPassword.value = false;
    code.value = "";
    loading.value = false;
    secret.value = "";
    otpauthUrl.value = "";
    backupCodes.value = [];
    qrDataUrl.value = "";
    qrError.value = null;
}

function close() {
    if (loading.value && step.value !== "backup") return;
    emit("update:open", false);
}

async function submitPassword() {
    if (!password.value.trim() || loading.value) return;
    loading.value = true;
    try {
        const result = await setupTotp(password.value);
        secret.value = result.secret;
        otpauthUrl.value = result.otpauthUrl;
        try {
            qrDataUrl.value = await QRCode.toDataURL(result.otpauthUrl, {
                errorCorrectionLevel: "M",
                margin: 2,
                width: 240,
            });
            qrError.value = null;
        } catch {
            qrError.value = t("profile.mfa.setup.qrError");
        }
        step.value = "scan";
        password.value = "";
    } catch {
        // toast handled in composable
    } finally {
        loading.value = false;
    }
}

async function submitCode() {
    const normalized = code.value.replace(/\s+/g, "");
    if (normalized.length !== 6 || loading.value) return;
    loading.value = true;
    try {
        const response = await confirmTotpSetup(normalized);
        backupCodes.value = response.backupCodes;
        step.value = "backup";
        code.value = "";
    } catch {
        code.value = "";
    } finally {
        loading.value = false;
    }
}

async function goToVerify() {
    step.value = "verify";
    await nextTick();
    const input = document.getElementById("mfa-setup-code") as HTMLInputElement | null;
    input?.focus();
}

function finish() {
    emit("enabled");
    emit("update:open", false);
}

function handleUpdateOpen(next: boolean) {
    if (step.value === "backup" || !loading.value) {
        emit("update:open", next);
    }
}
</script>

<template>
    <Dialog :open="open" @update:open="handleUpdateOpen">
        <DialogContent class="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>{{ t("profile.mfa.setup.title") }}</DialogTitle>
                <DialogDescription>
                    {{
                        step === "password"
                            ? t("profile.mfa.setup.descriptionPassword")
                            : step === "scan"
                              ? t("profile.mfa.setup.descriptionScan")
                              : step === "verify"
                                ? t("profile.mfa.setup.descriptionVerify")
                                : t("profile.mfa.setup.descriptionBackup")
                    }}
                </DialogDescription>
            </DialogHeader>

            <div v-if="step === 'password'" class="space-y-3">
                <Label for="mfa-setup-password">{{ t("common.confirmPassword") }}</Label>
                <div class="relative">
                    <Input
                        id="mfa-setup-password"
                        v-model="password"
                        :disabled="loading"
                        :placeholder="t('common.currentPasswordPlaceholder')"
                        :type="showPassword ? 'text' : 'password'"
                        autocomplete="current-password"
                        class="pr-10"
                        @keydown.enter="submitPassword" />
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

            <div v-else-if="step === 'scan'" class="space-y-4">
                <div class="flex justify-center">
                    <img
                        v-if="qrDataUrl"
                        :alt="t('profile.mfa.setup.qrAlt')"
                        :src="qrDataUrl"
                        class="border-border rounded-md border" />
                    <div v-else class="text-destructive text-sm">{{ qrError }}</div>
                </div>
                <div class="space-y-1">
                    <Label>{{ t("profile.mfa.setup.manualLabel") }}</Label>
                    <code class="bg-muted block rounded-md p-2 font-mono text-xs break-all">{{ secret }}</code>
                    <p class="text-muted-foreground text-xs">{{ t("profile.mfa.setup.manualHelp") }}</p>
                </div>
            </div>

            <div v-else-if="step === 'verify'" class="space-y-3">
                <Label for="mfa-setup-code">{{ t("profile.mfa.setup.codeLabel") }}</Label>
                <Input
                    id="mfa-setup-code"
                    v-model="code"
                    :disabled="loading"
                    autocomplete="one-time-code"
                    inputmode="numeric"
                    maxlength="6"
                    placeholder="123456"
                    type="text"
                    @keydown.enter="submitCode" />
            </div>

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
                <template v-if="step === 'password'">
                    <Button :disabled="loading" type="button" variant="ghost" @click="close">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="loading || !password.trim()" type="button" @click="submitPassword">
                        <Icon v-if="loading" class="mr-1 size-4 animate-spin" name="iconoir:refresh" />
                        {{ t("common.continue") }}
                    </Button>
                </template>
                <template v-else-if="step === 'scan'">
                    <Button type="button" variant="ghost" @click="close">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button type="button" @click="goToVerify">
                        {{ t("common.continue") }}
                    </Button>
                </template>
                <template v-else-if="step === 'verify'">
                    <Button :disabled="loading" type="button" variant="ghost" @click="step = 'scan'">
                        {{ t("common.back") }}
                    </Button>
                    <Button
                        :disabled="loading || code.replace(/\s+/g, '').length !== 6"
                        type="button"
                        @click="submitCode">
                        <Icon v-if="loading" class="mr-1 size-4 animate-spin" name="iconoir:refresh" />
                        {{ t("profile.mfa.setup.activate") }}
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
