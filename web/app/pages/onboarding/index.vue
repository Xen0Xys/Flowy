<script lang="ts" setup>
import {onMounted} from "vue";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {useAuthStore} from "@/stores/auth.store";
import {useOnboardingStore} from "@/stores/onboarding.store";
import {useUserStore} from "@/stores/user.store";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {cn} from "@/lib/utils";

definePageMeta({
    layout: "onboarding",
    pageTransition: {name: "fade", mode: "out-in", appear: true},
    onboarding: {step: 0},
});

const router = useRouter();
const userStore = useUserStore();
const authStore = useAuthStore();
const onboardingStore = useOnboardingStore();
const {t} = useI18n();

onMounted(() => {
    onboardingStore.hydrate();
    if (userStore.hasFamily) {
        router.replace("/");
    }
});

function goNext() {
    router.push("/onboarding/select");
}

function logout() {
    authStore.logout();
    onboardingStore.reset();
    router.push("/auth/login");
}

const bullets = [
    {icon: "iconoir:community", key: "family"},
    {icon: "iconoir:label", key: "categories"},
    {icon: "iconoir:mail", key: "invite"},
] as const;
</script>

<template>
    <Card :class="cn('w-full self-center', 'max-w-xl')">
        <CardContent class="flex flex-col gap-6 p-6">
            <header class="flex flex-col items-center gap-2 text-center">
                <div
                    class="bg-brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md">
                    <Icon class="h-7 w-7" name="iconoir:sparks" />
                </div>
                <h1 class="font-heading text-2xl font-semibold tracking-tight">
                    {{ t("onboarding.welcome.title") }}
                </h1>
                <p class="text-muted-foreground text-sm">
                    {{ t("onboarding.welcome.tagline") }}
                </p>
            </header>

            <ul class="flex flex-col gap-3">
                <li
                    v-for="(b, i) in bullets"
                    :key="b.key"
                    class="stagger-children bg-muted/40 flex items-start gap-3 rounded-lg p-3"
                    :style="{'--stagger-index': i}">
                    <div
                        class="bg-background text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                        <Icon class="h-5 w-5" :name="b.icon" />
                    </div>
                    <div class="flex flex-col">
                        <span class="text-sm font-medium">
                            {{ t(`onboarding.welcome.bullets.${b.key}.title`) }}
                        </span>
                        <span class="text-muted-foreground text-xs">
                            {{ t(`onboarding.welcome.bullets.${b.key}.description`) }}
                        </span>
                    </div>
                </li>
            </ul>

            <div class="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button :as="'button'" type="button" variant="ghost" @click.prevent="logout">
                    <Icon class="mr-2 h-4 w-4" name="iconoir:log-out" />
                    {{ t("onboarding.welcome.cta.logout") }}
                </Button>
                <Button
                    :as="'button'"
                    type="button"
                    class="bg-brand-gradient hover:shadow-glow text-white hover:brightness-110"
                    @click="goNext">
                    {{ t("onboarding.welcome.cta.start") }}
                    <Icon class="ml-2 h-4 w-4" name="iconoir:arrow-right" />
                </Button>
            </div>
        </CardContent>
    </Card>
</template>
