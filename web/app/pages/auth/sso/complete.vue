<script lang="ts" setup>
import {onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {useRoute, useRouter} from "#app";
import {useAuthStore, type MfaMethod} from "@/stores/auth.store";
import {useUserStore} from "@/stores/user.store";
import {SSO_MFA_COOKIE} from "@/utils/sso";

const KNOWN_MFA_METHODS: readonly MfaMethod[] = ["totp", "backup_code", "passkey"];

definePageMeta({
    layout: "auth",
    pageTransition: {name: "fade", mode: "out-in", appear: true},
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const userStore = useUserStore();
const {t} = useI18n();

const error = ref<string | null>(null);

function readMfaCookie(): {challengeToken: string; methods: MfaMethod[]} | null {
    if (import.meta.server) return null;
    const raw = document.cookie
        .split(";")
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(`${SSO_MFA_COOKIE}=`));
    if (!raw) return null;
    try {
        const value = decodeURIComponent(raw.split("=")[1] ?? "");
        const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed.challengeToken === "string" && Array.isArray(parsed.methods)) {
            const methods = (parsed.methods as unknown[]).filter(
                (entry): entry is MfaMethod =>
                    typeof entry === "string" && (KNOWN_MFA_METHODS as readonly string[]).includes(entry),
            );
            return {challengeToken: parsed.challengeToken, methods};
        }
    } catch {
        return null;
    }
    return null;
}

function clearMfaCookie() {
    if (import.meta.server) return;
    document.cookie = `${SSO_MFA_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

async function handleOk() {
    authStore.loadFromStorage();
    if (!authStore.isAuthenticated) {
        error.value = t("sso.errors.tokenMissing");
        return;
    }
    try {
        await userStore.fetchProfile();
    } catch {
        error.value = t("sso.errors.profileFetch");
        return;
    }
    toast.success(t("auth.store.success.connected"));
    await router.replace("/");
}

async function handleMfa() {
    const payload = readMfaCookie();
    clearMfaCookie();
    if (!payload) {
        error.value = t("sso.errors.mfaChallengeMissing");
        return;
    }
    authStore.setMfaChallenge({
        challengeToken: payload.challengeToken,
        methods: payload.methods,
    });
    await router.replace("/auth/mfa");
}

function handleError(code: string) {
    const localized = t(`sso.errors.${code}`, "");
    error.value = localized && localized !== `sso.errors.${code}` ? localized : t("sso.errors.internal");
    toast.error(error.value);
}

onMounted(async () => {
    const status = String(route.query.status ?? "").toLowerCase();
    if (status === "ok") return handleOk();
    if (status === "mfa") return handleMfa();
    if (status === "error") return handleError(String(route.query.code ?? "internal"));
    error.value = t("sso.errors.invalidCallback");
});

function backToLogin() {
    void router.replace("/auth/login");
}
</script>

<template>
    <section class="bg-card border-border/60 rounded-2xl border p-8 shadow-lg backdrop-blur-sm">
        <h1 class="font-heading mb-1 text-2xl font-semibold tracking-tight">
            {{ t("sso.complete.title") }}
        </h1>
        <p v-if="!error" class="text-muted-foreground text-sm">
            {{ t("sso.complete.pending") }}
        </p>
        <div v-else class="space-y-4">
            <p class="text-destructive text-sm" role="alert">{{ error }}</p>
            <button class="text-primary text-sm underline-offset-4 hover:underline" type="button" @click="backToLogin">
                {{ t("sso.complete.backToLogin") }}
            </button>
        </div>
    </section>
</template>
