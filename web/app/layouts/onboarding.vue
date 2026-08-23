<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useRoute} from "vue-router";
import {Card, CardContent} from "@/components/ui/card";
import {
    Stepper,
    StepperDescription,
    StepperIndicator,
    StepperItem,
    StepperTitle,
    StepperTrigger,
} from "@/components/ui/stepper";
import {cn} from "@/lib/utils";

interface OnboardingMeta {
    step?: number;
}

const route = useRoute();
const {t} = useI18n();

const steps = computed(() => [
    {title: t("onboarding.steps.welcome.title"), description: t("onboarding.steps.welcome.description")},
    {title: t("onboarding.steps.createJoin.title"), description: t("onboarding.steps.createJoin.description")},
    {title: t("onboarding.steps.invite.title"), description: t("onboarding.steps.invite.description")},
]);

const active = ref<number>(((route.meta.onboarding ?? {}) as OnboardingMeta).step ?? 0);
watch(
    () => (route.meta.onboarding as OnboardingMeta | undefined)?.step,
    (v) => {
        if (typeof v === "number") active.value = v;
    },
);
</script>

<template>
    <main class="flex min-h-dvh w-full grow flex-col">
        <div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10">
            <div class="bg-brand-gradient absolute -top-40 -right-40 h-96 w-96 rounded-full opacity-15 blur-3xl"></div>
            <div class="bg-brand-gradient absolute -bottom-40 -left-40 h-96 w-96 rounded-full opacity-10 blur-3xl"></div>
        </div>
        <div :class="cn('relative flex w-full grow flex-col justify-center self-center px-4', 'max-w-3xl')">
            <Card class="animate-fade-in-up py-0">
                <CardContent class="p-3">
                    <Stepper :class="cn('flex w-max justify-center gap-6 md:items-center', 'flex-col md:flex-row')">
                        <template v-for="(s, i) in steps" :key="i">
                            <StepperItem
                                :data-state="i === active ? 'active' : i < active ? 'completed' : 'inactive'"
                                :step="i"
                                class="flex">
                                <StepperTrigger class="px-3 py-2" @click="() => (active = i)">
                                    <div class="flex items-center gap-3">
                                        <StepperIndicator>
                                            <span class="inline-flex h-8 w-8 items-center justify-center">
                                                {{ i + 1 }}
                                            </span>
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
                </CardContent>
            </Card>

            <slot />
        </div>
    </main>
</template>
