<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useRoute} from "vue-router";
import {cn} from "@/lib/utils";

const route = useRoute();
const {t} = useI18n();

const isLogin = computed(() => route.path.startsWith("/auth/login"));
</script>

<template>
    <main :class="cn('bg-background relative flex min-h-dvh items-center justify-center overflow-hidden p-6')">
        <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
            <div class="bg-brand-gradient absolute -top-40 -left-40 h-96 w-96 rounded-full opacity-20 blur-3xl"></div>
            <div
                class="bg-brand-gradient absolute -right-40 -bottom-40 h-96 w-96 rounded-full opacity-15 blur-3xl"></div>
        </div>

        <div class="flex w-full max-w-5xl flex-col gap-8">
            <div class="flex items-center justify-center gap-3">
                <div class="relative">
                    <span
                        aria-hidden="true"
                        class="bg-brand-gradient absolute inset-0 rounded-2xl opacity-70 blur-lg"></span>
                    <img alt="Flowy" class="relative size-12 rounded-2xl" src="/flowy-logo.webp" />
                </div>
                <div class="font-heading text-4xl font-semibold tracking-tight md:text-5xl">Flowy</div>
            </div>

            <div class="grid w-full grid-cols-1 gap-8 md:grid-cols-2">
                <aside class="bg-brand-gradient relative hidden overflow-hidden rounded-2xl shadow-lg md:flex">
                    <div aria-hidden="true" class="absolute inset-0">
                        <div
                            class="animate-blob-a absolute top-[-20%] left-[-10%] h-[70%] w-[70%] rounded-full bg-white/25 blur-3xl"></div>
                        <div
                            class="animate-blob-b absolute right-[-15%] bottom-[-20%] h-[80%] w-[80%] rounded-full bg-white/15 blur-3xl"></div>
                        <div
                            class="animate-blob-c absolute top-[30%] right-[20%] h-[45%] w-[45%] rounded-full bg-white/10 blur-3xl"></div>
                        <div
                            class="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"></div>
                    </div>
                    <Transition mode="out-in" name="fade">
                        <div :key="isLogin" class="relative z-10 flex flex-col justify-end p-10 text-white">
                            <div
                                class="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide backdrop-blur">
                                <span class="size-1.5 rounded-full bg-white"></span>
                                {{ isLogin ? t("auth.login.welcome") : t("auth.register.heading") }}
                            </div>
                            <h2 class="font-heading mb-2 text-3xl font-semibold tracking-tight lg:text-4xl">
                                {{ isLogin ? t("auth.login.welcome") : t("auth.register.heading") }}
                            </h2>
                            <p class="max-w-sm text-sm text-white/85">
                                {{ isLogin ? t("auth.login.subtitle") : t("auth.register.subtitle") }}
                            </p>
                        </div>
                    </Transition>
                </aside>

                <div class="flex flex-col gap-6">
                    <slot />
                </div>
            </div>
        </div>
    </main>
</template>
