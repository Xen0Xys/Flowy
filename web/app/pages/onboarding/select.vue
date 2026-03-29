<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {useUserStore} from "@/stores/user.store";
import {useApi} from "@/composables/useApi";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card} from "@/components/ui/card";
import {
    Stepper,
    StepperDescription,
    StepperIndicator,
    StepperItem,
    StepperTitle,
    StepperTrigger,
} from "@/components/ui/stepper";
import {cn} from "@/lib/utils";

const router = useRouter();
const store = useUserStore();
const {apiFetch} = useApi();
const {t} = useI18n();
const code = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

const steps = [
    {title: t("onboarding.steps.welcome.title"), description: t("onboarding.steps.welcome.description")},
    {title: t("onboarding.steps.createJoin.title"), description: t("onboarding.steps.createJoin.description")},
    {title: t("onboarding.steps.invite.title"), description: t("onboarding.steps.invite.description")},
];

const active = ref(1);

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
        // refresh profile and go home
        try {
            await store.fetchProfile();
        } catch {
            // ignore profile refresh failures
        }
        toast.success(t("onboarding.select.toast.joined"));
        // clear inline error when success is displayed via toast
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
    <div :class="cn('flex w-full grow flex-col justify-center self-center px-4', 'max-w-3xl')">
        <Card innerClass="p-3">
            <Stepper :class="cn('flex w-max justify-center gap-6 md:items-center', 'flex-col md:flex-row')">
                <template v-for="(s, i) in steps" :key="i">
                    <StepperItem
                        :data-state="i === active ? 'active' : i < active ? 'completed' : 'inactive'"
                        :step="i"
                        class="flex">
                        <StepperTrigger class="px-3 py-2" @click="() => (active = i)">
                            <div class="flex items-center gap-3">
                                <StepperIndicator>
                                    <span class="inline-flex h-8 w-8 items-center justify-center">{{ i + 1 }}</span>
                                </StepperIndicator>
                                <div class="text-left">
                                    <StepperTitle>{{ s.title }}</StepperTitle>
                                    <StepperDescription>{{ s.description }}</StepperDescription>
                                </div>
                            </div>
                        </StepperTrigger>
                    </StepperItem>
                </template>
            </Stepper>
        </Card>

        <div class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
            <Card :innerClass="cn('flex flex-col justify-between', 'h-auto sm:h-72', 'p-4')">
                <div class="flex flex-col gap-1">
                    <h2 class="text-lg font-medium">{{ t("onboarding.select.create.title") }}</h2>
                    <p class="text-muted-foreground text-sm">
                        {{ t("onboarding.select.create.description") }}
                    </p>
                </div>
                <div class="flex justify-end">
                    <Button :as="'button'" @click="goCreate">{{ t("onboarding.select.create.button") }}</Button>
                </div>
            </Card>

            <Card :innerClass="cn('flex flex-col justify-between', 'h-auto sm:h-72', 'p-4')">
                <div class="flex flex-col gap-2">
                    <div>
                        <h2 class="text-lg font-medium">{{ t("onboarding.select.join.title") }}</h2>
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
                        <Button :as="'button'" :disabled="loading" type="submit">{{
                            loading ? t("onboarding.select.join.loading") : t("onboarding.select.join.button")
                        }}</Button>
                    </div>

                    <div v-if="error" class="text-destructive text-sm" role="alert">
                        {{ error }}
                    </div>
                </form>
            </Card>
        </div>
    </div>
</template>
