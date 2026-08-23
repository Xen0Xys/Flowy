<script lang="ts" setup>
import {onMounted, ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {useOnboardingStore} from "@/stores/onboarding.store";
import {useUserStore} from "@/stores/user.store";
import {useApi} from "@/composables/useApi";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent} from "@/components/ui/card";

definePageMeta({
    layout: "onboarding",
    pageTransition: {name: "fade", mode: "out-in"},
    onboarding: {step: 1},
});

const router = useRouter();
const store = useUserStore();
const onboardingStore = useOnboardingStore();
const {apiFetch} = useApi();
const {t} = useI18n();
const code = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

onMounted(() => {
    onboardingStore.hydrate();
    if (store.hasFamily) {
        router.replace("/");
    }
});

function goBack() {
    router.push("/onboarding");
}

function goCreate() {
    onboardingStore.setMode("create");
    return router.push("/onboarding/create-family");
}

async function joinFamily() {
    error.value = null;
    if (!code.value) {
        error.value = t("onboarding.select.errors.inviteRequired");
        return;
    }

    loading.value = true;
    try {
        await apiFetch(`/family/join/${encodeURIComponent(code.value)}`, {
            method: "POST",
        });
        try {
            await store.fetchProfile();
        } catch (refreshErr) {
            console.warn("[onboarding/select] profile refresh failed after join", refreshErr);
        }
        onboardingStore.reset();
        toast.success(t("onboarding.select.toast.joined"));
        await router.push("/");
    } catch (err: any) {
        const msg = err?.data?.message ?? err?.message ?? t("onboarding.select.errors.joinFailed");
        toast.error(msg);
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div class="flex flex-col gap-4">
        <div class="stagger-children grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
            <Card :style="{'--stagger-index': 0}" class="py-0 transition-shadow hover:shadow-md">
                <CardContent class="flex h-auto flex-col justify-between gap-4 p-4 sm:h-72">
                    <div class="flex flex-col gap-2">
                        <div class="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                            <Icon class="h-5 w-5" name="iconoir:plus" />
                        </div>
                        <h2 class="font-heading text-lg font-semibold tracking-tight">
                            {{ t("onboarding.select.create.title") }}
                        </h2>
                        <p class="text-muted-foreground text-sm">
                            {{ t("onboarding.select.create.description") }}
                        </p>
                    </div>
                    <div class="flex justify-end">
                        <Button
                            :as="'button'"
                            class="bg-brand-gradient hover:shadow-glow text-white hover:brightness-110"
                            @click="goCreate">
                            {{ t("onboarding.select.create.button") }}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card :style="{'--stagger-index': 1}" class="py-0 transition-shadow hover:shadow-md">
                <CardContent class="flex h-auto flex-col justify-between gap-4 p-4 sm:h-72">
                    <div class="flex flex-col gap-2">
                        <div class="bg-accent/40 text-foreground flex h-10 w-10 items-center justify-center rounded-lg">
                            <Icon class="h-5 w-5" name="iconoir:community" />
                        </div>
                        <div>
                            <h2 class="font-heading text-lg font-semibold tracking-tight">
                                {{ t("onboarding.select.join.title") }}
                            </h2>
                            <p class="text-muted-foreground text-sm">
                                {{ t("onboarding.select.join.description") }}
                            </p>
                        </div>
                        <Input
                            v-model="code"
                            :placeholder="t('onboarding.select.join.inviteCode')"
                            autofocus
                            @keydown.enter.prevent="joinFamily" />
                    </div>

                    <form class="flex flex-col gap-1" @submit.prevent="joinFamily">
                        <div class="flex items-center justify-end">
                            <Button :as="'button'" :disabled="loading" type="submit">
                                <Icon v-if="loading" class="mr-2" name="svg-spinners:180-ring-with-bg" />
                                {{ loading ? t("onboarding.select.join.loading") : t("onboarding.select.join.button") }}
                            </Button>
                        </div>
                        <div v-if="error" class="text-destructive text-sm" role="alert">
                            {{ error }}
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>

        <div class="flex justify-start">
            <Button :as="'button'" type="button" variant="ghost" @click.prevent="goBack">
                <Icon class="mr-2 h-4 w-4" name="iconoir:arrow-left" />
                {{ t("common.back") }}
            </Button>
        </div>
    </div>
</template>
