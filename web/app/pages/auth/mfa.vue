<script lang="ts" setup>
import {computed, onBeforeMount, ref} from "vue";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {useAuthStore, type MfaMethod} from "@/stores/auth.store";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";

definePageMeta({
    layout: "auth",
    pageTransition: {name: "fade", mode: "out-in", appear: true},
});

const router = useRouter();
const store = useAuthStore();
const {t} = useI18n();

const activeMethod = ref<MfaMethod>("totp");
const code = ref("");
const loading = ref(false);

const availableMethods = computed<MfaMethod[]>(() => store.mfaChallenge?.methods ?? []);
const canUseBackup = computed(() => availableMethods.value.includes("backup_code"));

onBeforeMount(async () => {
    if (!store.mfaChallenge) {
        await router.replace("/auth/login");
        return;
    }
    activeMethod.value = availableMethods.value.includes("totp") ? "totp" : "backup_code";
});

function switchMethod(method: MfaMethod) {
    activeMethod.value = method;
    code.value = "";
}

async function submit() {
    if (!code.value.trim() || loading.value) return;
    loading.value = true;
    try {
        await store.verifyMfa({code: code.value.trim(), method: activeMethod.value});
        await router.push("/");
    } catch {
        code.value = "";
    } finally {
        loading.value = false;
    }
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
                        <Input
                            id="mfa-code"
                            v-model="code"
                            :aria-label="t('auth.mfa.codeLabelTotp')"
                            :autocomplete="activeMethod === 'totp' ? 'one-time-code' : 'off'"
                            :inputmode="activeMethod === 'totp' ? 'numeric' : 'text'"
                            :placeholder="activeMethod === 'totp' ? '123456' : 'XXXX-XXXX'"
                            autofocus
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
                    :disabled="loading || !code.trim()"
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
