<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "~/components/ui/card";
import {cn} from "@/lib/utils";
import {isValidEmail} from "@/lib/validation";
import {useOnboardingStore} from "@/stores/onboarding.store";
import {useUserStore} from "@/stores/user.store";

definePageMeta({
    layout: "onboarding",
    pageTransition: {name: "fade", mode: "out-in"},
    onboarding: {step: 4},
});

const router = useRouter();
const familyStore = useFamilyStore();
const userStore = useUserStore();
const onboardingStore = useOnboardingStore();
const {t} = useI18n();

const currentInput = ref("");
const pendingEmails = ref<string[]>([]);
const sentEmails = ref<string[]>([]);
const loading = ref(false);

onMounted(() => {
    onboardingStore.hydrate();
    if (!userStore.hasFamily) {
        router.replace("/onboarding");
    }
});

const canSend = computed(() => pendingEmails.value.length > 0 && !loading.value);

function addEmail() {
    const raw = currentInput.value.trim().replace(/,$/, "").trim();
    if (!raw) return;
    if (!isValidEmail(raw)) {
        toast.error(t("onboarding.invite.chipInput.invalid"));
        return;
    }
    const normalized = raw.toLowerCase();
    if (pendingEmails.value.includes(normalized) || sentEmails.value.includes(normalized)) {
        toast.error(t("onboarding.invite.chipInput.duplicate"));
        return;
    }
    pendingEmails.value.push(normalized);
    currentInput.value = "";
}

function removePending(email: string) {
    pendingEmails.value = pendingEmails.value.filter((e) => e !== email);
}

function onInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addEmail();
    } else if (e.key === "Backspace" && !currentInput.value && pendingEmails.value.length) {
        pendingEmails.value = pendingEmails.value.slice(0, -1);
    }
}

async function sendInvites() {
    if (currentInput.value.trim()) {
        addEmail();
    }
    if (!pendingEmails.value.length) return;

    loading.value = true;
    try {
        const {sent, failed} = await familyStore.inviteMembers([...pendingEmails.value]);
        sentEmails.value = [...sentEmails.value, ...sent];
        pendingEmails.value = pendingEmails.value.filter((e) => !sent.includes(e));

        if (failed.length === 0) {
            toast.success(t("onboarding.invite.summary.success", {count: sent.length}));
        } else if (sent.length > 0) {
            toast.warning(t("onboarding.invite.summary.partial", {success: sent.length, failed: failed.length}));
        } else {
            toast.error(t("onboarding.invite.summary.failed"));
        }
    } finally {
        loading.value = false;
    }
}

async function finish() {
    onboardingStore.reset();
    await router.push("/");
}

async function goBack() {
    await router.push("/onboarding/categories");
}
</script>

<template>
    <Card :class="cn('w-full self-center', 'max-w-xl')">
        <CardContent class="flex flex-col gap-5 p-6">
            <header class="flex flex-col gap-1 text-center">
                <h1 class="font-heading text-2xl font-semibold tracking-tight">
                    {{ t("onboarding.invite.title") }}
                </h1>
                <p class="text-muted-foreground text-sm">
                    {{ t("onboarding.invite.description") }}
                </p>
            </header>

            <section class="flex flex-col gap-2">
                <label class="text-sm font-medium" for="invite-email-input">
                    {{ t("onboarding.invite.chipInput.label") }}
                </label>
                <div
                    class="border-input focus-within:border-primary focus-within:ring-primary/20 flex min-h-11 flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 transition-colors focus-within:ring-2">
                    <span
                        v-for="email in pendingEmails"
                        :key="email"
                        class="bg-primary/10 text-primary flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
                        {{ email }}
                        <button
                            type="button"
                            class="hover:text-destructive"
                            :aria-label="t('onboarding.invite.chipInput.remove', {email})"
                            @click="removePending(email)">
                            <Icon class="h-3 w-3" name="iconoir:xmark" />
                        </button>
                    </span>
                    <input
                        id="invite-email-input"
                        v-model="currentInput"
                        class="placeholder:text-muted-foreground min-w-[10ch] flex-1 bg-transparent text-sm outline-none"
                        type="email"
                        autofocus
                        :placeholder="t('onboarding.invite.chipInput.placeholder')"
                        @keydown="onInputKeydown"
                        @blur="addEmail" />
                </div>
                <p class="text-muted-foreground text-xs">
                    {{ t("onboarding.invite.chipInput.hint") }}
                </p>
            </section>

            <section v-if="sentEmails.length" class="flex flex-col gap-2">
                <h2 class="text-sm font-medium">
                    {{ t("onboarding.invite.sent.title", {count: sentEmails.length}) }}
                </h2>
                <ul class="flex flex-wrap gap-2">
                    <li
                        v-for="email in sentEmails"
                        :key="email"
                        class="border-primary/30 bg-primary/5 flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">
                        <Icon class="text-primary h-3 w-3" name="iconoir:check-circle-solid" />
                        <span>{{ email }}</span>
                    </li>
                </ul>
            </section>

            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button :as="'button'" type="button" variant="ghost" :disabled="loading" @click.prevent="goBack">
                    <Icon class="mr-2 h-4 w-4" name="iconoir:arrow-left" />
                    {{ t("common.back") }}
                </Button>
                <div class="flex flex-col-reverse gap-2 sm:flex-row">
                    <Button :as="'button'" type="button" variant="outline" :disabled="loading" @click.prevent="finish">
                        {{ sentEmails.length > 0 ? t("onboarding.invite.finish") : t("onboarding.invite.skip") }}
                    </Button>
                    <Button
                        :as="'button'"
                        type="button"
                        :disabled="!canSend"
                        class="bg-brand-gradient hover:shadow-glow text-white hover:brightness-110"
                        @click.prevent="sendInvites">
                        <Icon v-if="loading" class="mr-2" name="svg-spinners:180-ring-with-bg" />
                        {{ loading ? t("onboarding.invite.sending") : t("onboarding.invite.send") }}
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
