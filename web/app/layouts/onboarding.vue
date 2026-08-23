<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useRoute} from "vue-router";
import {Card, CardContent} from "@/components/ui/card";
import {Stepper, StepperDescription, StepperIndicator, StepperItem, StepperTitle} from "@/components/ui/stepper";
import {cn} from "@/lib/utils";

interface OnboardingMeta {
    step?: number;
}

const route = useRoute();
const {t} = useI18n();

const steps = computed(() => [
    {title: t("onboarding.steps.welcome.title"), description: t("onboarding.steps.welcome.description")},
    {title: t("onboarding.steps.select.title"), description: t("onboarding.steps.select.description")},
    {title: t("onboarding.steps.createFamily.title"), description: t("onboarding.steps.createFamily.description")},
    {title: t("onboarding.steps.categories.title"), description: t("onboarding.steps.categories.description")},
    {title: t("onboarding.steps.invite.title"), description: t("onboarding.steps.invite.description")},
]);

const active = ref<number>(((route.meta.onboarding ?? {}) as OnboardingMeta).step ?? 0);
watch(
    () => (route.meta.onboarding as OnboardingMeta | undefined)?.step,
    (v) => {
        if (typeof v === "number") active.value = v;
    },
);

const progressPercent = computed(() => Math.round(((active.value + 1) / steps.value.length) * 100));
</script>

<template>
    <main class="flex min-h-dvh w-full grow flex-col">
        <div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10">
            <div class="bg-brand-gradient absolute -top-40 -right-40 h-96 w-96 rounded-full opacity-15 blur-3xl"></div>
            <div class="bg-brand-gradient absolute -bottom-40 -left-40 h-96 w-96 rounded-full opacity-10 blur-3xl"></div>
        </div>
        <div :class="cn('relative flex w-full grow flex-col justify-center gap-4 self-center px-4 py-6', 'max-w-3xl')">
            <Card class="animate-fade-in-up py-0">
                <CardContent class="p-3">
                    <div class="hidden md:block">
                        <Stepper class="flex w-full items-center justify-between gap-2">
                            <template v-for="(s, i) in steps" :key="i">
                                <StepperItem
                                    :data-state="i === active ? 'active' : i < active ? 'completed' : 'inactive'"
                                    :step="i"
                                    :aria-current="i === active ? 'step' : undefined"
                                    class="pointer-events-none flex flex-1 items-center gap-2">
                                    <StepperIndicator
                                        :class="
                                            cn(
                                                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors',
                                                i === active
                                                    ? 'bg-brand-gradient border-transparent text-white shadow-sm'
                                                    : i < active
                                                      ? 'border-primary/30 bg-primary/10 text-primary'
                                                      : 'border-border text-muted-foreground',
                                            )
                                        ">
                                        <Icon v-if="i < active" class="h-4 w-4" name="iconoir:check" />
                                        <span v-else>{{ i + 1 }}</span>
                                    </StepperIndicator>
                                    <div class="min-w-0 text-left">
                                        <StepperTitle
                                            :class="
                                                cn(
                                                    'block truncate text-sm font-medium',
                                                    i === active ? '' : 'text-muted-foreground',
                                                )
                                            ">
                                            {{ s.title }}
                                        </StepperTitle>
                                        <StepperDescription class="text-muted-foreground block truncate text-xs">
                                            {{ s.description }}
                                        </StepperDescription>
                                    </div>
                                </StepperItem>
                            </template>
                        </Stepper>
                    </div>
                    <div
                        class="flex flex-col gap-2 md:hidden"
                        role="progressbar"
                        :aria-valuenow="active + 1"
                        aria-valuemin="1"
                        :aria-valuemax="steps.length">
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex flex-col">
                                <span class="text-sm font-medium">{{ steps[active]?.title }}</span>
                                <span class="text-muted-foreground text-xs">{{ steps[active]?.description }}</span>
                            </div>
                            <span class="text-muted-foreground shrink-0 text-xs font-medium">
                                {{ active + 1 }} / {{ steps.length }}
                            </span>
                        </div>
                        <div class="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                            <div
                                class="bg-brand-gradient h-full rounded-full transition-all duration-500"
                                :style="{width: `${progressPercent}%`}"></div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <slot />
        </div>
    </main>
</template>
