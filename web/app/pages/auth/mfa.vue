<script lang="ts" setup>
import {computed, onBeforeMount, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {useAuthStore, type MfaMethod} from "@/stores/auth.store";
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

const availableMethods = computed<MfaMethod[]>(() => store.mfaChallenge?.methods ?? []);
const canUseBackup = computed(() => availableMethods.value.includes("backup_code"));

const currentCode = computed(() =>
    activeMethod.value === "totp" ? totpDigits.value.join("") : backupCode.value.trim(),
);
const canSubmit = computed(() =>
    activeMethod.value === "totp" ? totpDigits.value.filter(Boolean).length === 6 : currentCode.value.length > 0,
);

onBeforeMount(async () => {
    if (!store.mfaChallenge) {
        await router.replace("/auth/login");
        return;
    }
    activeMethod.value = availableMethods.value.includes("totp") ? "totp" : "backup_code";
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
    } catch {
        totpDigits.value = [];
        backupCode.value = "";
    } finally {
        loading.value = false;
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

        <form class="space-y-4" novalidate @submit.prevent="submit">
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
                v-else-if="activeMethod === 'backup_code'"
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
