<script lang="ts" setup>
import {computed, onBeforeMount, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {useRouter} from "#app";
import {MfaChallengeExpiredError, useAuthStore, type MfaMethod} from "@/stores/auth.store";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {PinInput, PinInputGroup, PinInputSeparator, PinInputSlot} from "@/components/ui/pin-input";
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";

definePageMeta({
    layout: "auth",
    pageTransition: {name: "fade", mode: "out-in", appear: true},
});

const router = useRouter();
const store = useAuthStore();
const {t} = useI18n();

const activeMethod = ref<MfaMethod>("totp");
const totpDigits = ref<string[]>([]);
const backupCode = ref("");
const loading = ref(false);
const passkeyLoading = ref(false);
const passkeyAttempted = ref(false);

const availableMethods = computed<MfaMethod[]>(() => store.mfaChallenge?.methods ?? []);
const canUsePasskey = computed(() => availableMethods.value.includes("passkey"));
const canUseTotp = computed(() => availableMethods.value.includes("totp"));
const canUseBackup = computed(() => availableMethods.value.includes("backup_code"));

const currentCode = computed(() =>
    activeMethod.value === "totp" ? totpDigits.value.join("") : backupCode.value.trim(),
);
const canSubmit = computed(() => {
    if (activeMethod.value === "totp") return totpDigits.value.filter(Boolean).length === 6;
    if (activeMethod.value === "backup_code") return currentCode.value.length > 0;
    return false;
});

onBeforeMount(async () => {
    if (!store.mfaChallenge) {
        await router.replace("/auth/login");
        return;
    }
    if (canUseTotp.value) activeMethod.value = "totp";
    else if (canUseBackup.value) activeMethod.value = "backup_code";
    else if (canUsePasskey.value) activeMethod.value = "passkey";

    // Auto-invoke the passkey ceremony whenever the user has a passkey enrolled;
    // if they cancel the browser prompt, the TOTP/backup form remains usable.
    if (canUsePasskey.value && !passkeyAttempted.value) {
        passkeyAttempted.value = true;
        void submitPasskey();
    }
});

watch(activeMethod, () => {
    totpDigits.value = [];
    backupCode.value = "";
});

async function submit() {
    if (!canSubmit.value || loading.value) return;
    loading.value = true;
    try {
        const result = await store.verifyMfa({code: currentCode.value, method: activeMethod.value});
        if (result.mfaAutoDisabled) {
            await router.push("/settings/user/profile");
        } else {
            await router.push("/");
        }
    } catch (err) {
        if (err instanceof MfaChallengeExpiredError) {
            toast.error(t("auth.mfa.errors.challengeExpired"));
            await router.replace("/auth/login");
            return;
        }
        totpDigits.value = [];
        backupCode.value = "";
    } finally {
        loading.value = false;
    }
}

async function submitPasskey() {
    if (passkeyLoading.value) return;
    passkeyLoading.value = true;
    try {
        await store.verifyMfaPasskey();
        await router.push("/");
    } catch (err) {
        if (err instanceof MfaChallengeExpiredError) {
            toast.error(t("auth.mfa.errors.challengeExpired"));
            await router.replace("/auth/login");
        }
        // Cancellation or invalid-code cases already toasted upstream.
    } finally {
        passkeyLoading.value = false;
    }
}

function handleComplete() {
    void submit();
}

function switchMethod(method: MfaMethod) {
    activeMethod.value = method;
}

function cancel() {
    store.clearMfaChallenge();
    void router.push("/auth/login");
}
</script>

<template>
    <section class="bg-card border-border/60 rounded-2xl border p-8 shadow-lg backdrop-blur-sm">
        <h1 class="font-heading mb-1 text-2xl font-semibold tracking-tight">
            {{ t("auth.mfa.title") }}
        </h1>
        <p class="text-muted-foreground mb-6 text-sm">
            {{ activeMethod === "totp" ? t("auth.mfa.subtitleTotp") : t("auth.mfa.subtitleBackup") }}
        </p>

        <div v-if="canUsePasskey" class="mb-6 space-y-3">
            <Button
                :aria-label="t('auth.mfa.usePasskey')"
                :disabled="passkeyLoading || loading"
                class="w-full"
                type="button"
                variant="outline"
                @click="submitPasskey">
                <Icon v-if="passkeyLoading" class="mr-2" name="svg-spinners:180-ring-with-bg" />
                <Icon v-else class="mr-2" name="iconoir:fingerprint" />
                {{
                    passkeyLoading
                        ? t("auth.mfa.passkeyPrompting")
                        : passkeyAttempted
                          ? t("auth.mfa.usePasskeyRetry")
                          : t("auth.mfa.usePasskey")
                }}
            </Button>
            <div v-if="canUseTotp || canUseBackup" class="flex items-center gap-3">
                <span class="bg-border h-px flex-1"></span>
                <span class="text-muted-foreground text-xs uppercase">{{ t("auth.mfa.orDivider") }}</span>
                <span class="bg-border h-px flex-1"></span>
            </div>
        </div>

        <form v-if="canUseTotp || canUseBackup" class="space-y-4" novalidate @submit.prevent="submit">
            <FormItem>
                <FormField name="code">
                    <FormLabel for="mfa-code">
                        {{ activeMethod === "totp" ? t("auth.mfa.codeLabelTotp") : t("auth.mfa.codeLabelBackup") }}
                    </FormLabel>
                    <FormControl>
                        <PinInput
                            v-if="activeMethod === 'totp'"
                            id="mfa-code"
                            v-model="totpDigits"
                            :aria-label="t('auth.mfa.codeLabelTotp')"
                            :disabled="loading"
                            :otp="true"
                            class="justify-center"
                            type="text"
                            @complete="handleComplete">
                            <PinInputGroup>
                                <PinInputSlot v-for="index in 3" :key="`start-${index}`" :index="index - 1" />
                            </PinInputGroup>
                            <PinInputSeparator />
                            <PinInputGroup>
                                <PinInputSlot v-for="index in 3" :key="`end-${index}`" :index="index + 2" />
                            </PinInputGroup>
                        </PinInput>
                        <Input
                            v-else
                            id="mfa-code"
                            v-model="backupCode"
                            :aria-label="t('auth.mfa.codeLabelBackup')"
                            autocomplete="off"
                            autofocus
                            class="text-center font-mono tracking-widest uppercase"
                            inputmode="text"
                            placeholder="XXXX-XXXX"
                            required
                            type="text" />
                    </FormControl>
                    <FormMessage />
                </FormField>
            </FormItem>

            <div class="pt-2">
                <Button
                    :aria-label="t('auth.mfa.verifyAction')"
                    :as="'button'"
                    :disabled="loading || !canSubmit"
                    class="bg-brand-gradient hover:shadow-glow w-full font-medium text-white shadow-md transition-all hover:brightness-110 disabled:opacity-70"
                    type="submit">
                    <Icon v-if="loading" class="mr-2" name="svg-spinners:180-ring-with-bg" />
                    {{ loading ? t("auth.mfa.verifying") : t("auth.mfa.verifyAction") }}
                </Button>
            </div>
        </form>

        <div class="mt-6 flex items-center justify-between text-sm">
            <button
                v-if="canUseBackup && activeMethod === 'totp'"
                class="text-primary underline-offset-4 hover:underline"
                type="button"
                @click="switchMethod('backup_code')">
                {{ t("auth.mfa.useBackupCode") }}
            </button>
            <button
                v-else-if="canUseTotp && activeMethod === 'backup_code'"
                class="text-primary underline-offset-4 hover:underline"
                type="button"
                @click="switchMethod('totp')">
                {{ t("auth.mfa.useAuthenticator") }}
            </button>
            <span v-else></span>
            <button class="text-muted-foreground underline-offset-4 hover:underline" type="button" @click="cancel">
                {{ t("auth.mfa.cancel") }}
            </button>
        </div>
    </section>
</template>
