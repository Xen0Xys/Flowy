<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
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
const {apiFetch} = useApi();
const {t} = useI18n();
const code = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

function goCreate() {
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
        } catch {
            // ignore profile refresh failures
        }
        toast.success(t("onboarding.select.toast.joined"));
        error.value = null;
        await router.push("/");
    } catch (err: any) {
        const msg = err?.data?.message ?? err?.message ?? t("onboarding.select.errors.joinFailed");
        toast.error(msg);
        error.value = null;
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div class="stagger-children grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        <Card :style="{'--stagger-index': 0}" class="py-0 transition-shadow hover:shadow-md">
            <CardContent class="flex h-auto flex-col justify-between p-4 sm:h-72">
                <div class="flex flex-col gap-1">
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
            <CardContent class="flex h-auto flex-col justify-between p-4 sm:h-72">
                <div class="flex flex-col gap-2">
                    <div>
                        <h2 class="font-heading text-lg font-semibold tracking-tight">
                            {{ t("onboarding.select.join.title") }}
                        </h2>
                        <p class="text-muted-foreground text-sm">
                            {{ t("onboarding.select.join.description") }}
                        </p>
                    </div>
                    <div>
                        <Input v-model="code" :placeholder="t('onboarding.select.join.inviteCode')" autofocus />
                    </div>
                </div>

                <form class="flex flex-col" @submit.prevent="joinFamily">
                    <div class="flex items-center justify-end">
                        <Button :as="'button'" :disabled="loading" type="submit">
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
</template>
