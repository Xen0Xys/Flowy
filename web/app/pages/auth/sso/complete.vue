<script lang="ts" setup>
import {onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {useRoute, useRouter} from "#app";
import {useAuthStore} from "@/stores/auth.store";
import {SSO_VERIFIER_STORAGE_KEY} from "@/utils/sso";

definePageMeta({
    layout: "auth",
    pageTransition: {name: "fade", mode: "out-in", appear: true},
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const {t} = useI18n();

const error = ref<string | null>(null);

function takeTicket(): string | null {
    if (!window.location.hash) return null;
    const ticket = new URLSearchParams(window.location.hash.slice(1)).get("ticket");
    // Drop the ticket from the address bar and history before anything else.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    return ticket;
}

function takeVerifier(): string | null {
    const verifier = sessionStorage.getItem(SSO_VERIFIER_STORAGE_KEY);
    sessionStorage.removeItem(SSO_VERIFIER_STORAGE_KEY);
    return verifier;
}

async function handleTicket(ticket: string) {
    const verifier = takeVerifier();
    if (!verifier) {
        error.value = t("sso.errors.sessionMismatch");
        return;
    }
    try {
        const {mfaRequired} = await authStore.exchangeSsoTicket(ticket, verifier);
        await router.replace(mfaRequired ? "/auth/mfa" : "/");
    } catch (err: any) {
        const status = err?.statusCode ?? err?.status ?? err?.response?.status;
        error.value = status === 401 || status === 400 ? t("sso.errors.ticketInvalid") : t("sso.errors.internal");
    }
}

function handleError(code: string) {
    const localized = t(`sso.errors.${code}`, "");
    error.value = localized && localized !== `sso.errors.${code}` ? localized : t("sso.errors.internal");
    toast.error(error.value);
}

onMounted(async () => {
    const ticket = takeTicket();
    if (String(route.query.status ?? "").toLowerCase() === "error") {
        takeVerifier();
        return handleError(String(route.query.code ?? "internal"));
    }
    if (ticket) return handleTicket(ticket);
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
