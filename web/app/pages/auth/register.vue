<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {useAuthStore} from "@/stores/auth.store";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    isValidEmail,
    isValidPassword,
    isValidUsername,
    PASSWORD_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
} from "@/lib/validation";
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";

const router = useRouter();
const store = useAuthStore();
const {t} = useI18n();

const form = ref({username: "", email: "", password: ""});
const loading = ref(false);
const error = ref<string | null>(null);

function validate() {
    const username = form.value.username.trim();
    const email = form.value.email.trim();
    const password = form.value.password;

    if (!username || !email || !password) {
        const msg = t("auth.register.errors.required");
        toast.error(msg);
        error.value = null;
        return false;
    }

    if (!isValidUsername(username)) {
        const msg = t("auth.register.errors.usernameLength", {
            min: USERNAME_MIN_LENGTH,
            max: USERNAME_MAX_LENGTH,
        });
        toast.error(msg);
        error.value = null;
        return false;
    }

    if (!isValidEmail(email)) {
        const msg = t("auth.common.errors.invalidEmail");
        toast.error(msg);
        error.value = null;
        return false;
    }

    if (!isValidPassword(password)) {
        const msg = t("auth.register.errors.passwordLength", {min: PASSWORD_MIN_LENGTH});
        toast.error(msg);
        error.value = null;
        return false;
    }

    form.value.username = username;
    form.value.email = email;
    return true;
}

async function submit() {
    error.value = null;
    if (!validate()) return;
    loading.value = true;
    try {
        await store.register({
            username: form.value.username,
            email: form.value.email,
            password: form.value.password,
        });
        await router.push("/");
    } catch (err: any) {
        error.value = null;
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <main :class="cn('bg-background relative flex min-h-dvh items-center justify-center overflow-hidden p-6')">
        <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
            <div class="bg-brand-gradient absolute -top-40 -left-40 h-96 w-96 rounded-full opacity-20 blur-3xl"></div>
            <div
                class="bg-brand-gradient absolute -right-40 -bottom-40 h-96 w-96 rounded-full opacity-15 blur-3xl"></div>
        </div>

        <div class="animate-fade-in-up flex w-full max-w-5xl flex-col gap-8">
            <div class="flex items-center justify-center gap-3">
                <div class="relative">
                    <span
                        aria-hidden="true"
                        class="bg-brand-gradient absolute inset-0 rounded-2xl opacity-70 blur-lg"></span>
                    <img alt="Flowy" class="relative size-12 rounded-2xl" src="/flowy-logo.webp" />
                </div>
                <div class="font-heading text-4xl font-semibold tracking-tight md:text-5xl">Flowy</div>
            </div>

            <div :class="cn('grid w-full grid-cols-1 gap-8 md:grid-cols-2')">
                <aside
                    class="bg-brand-gradient relative hidden overflow-hidden rounded-2xl shadow-lg md:flex md:min-h-[520px]">
                    <div aria-hidden="true" class="absolute inset-0">
                        <svg
                            class="absolute -bottom-16 -left-16 h-[420px] w-[420px] opacity-15"
                            fill="white"
                            viewBox="0 0 100 100"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M18 12 Q14 12 14 18 L14 82 Q14 88 20 88 L28 88 Q34 88 34 82 L34 58 L54 58 Q60 58 60 52 L60 46 Q60 40 54 40 L34 40 L34 32 L66 32 Q72 32 72 26 L72 18 Q72 12 66 12 Z" />
                        </svg>
                        <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-white/5"></div>
                        <div class="absolute top-16 right-16 h-32 w-32 rounded-full bg-white/10 blur-2xl"></div>
                        <div class="absolute bottom-24 left-20 h-40 w-40 rounded-full bg-white/10 blur-2xl"></div>
                    </div>
                    <div class="relative z-10 flex flex-col justify-end p-10 text-white">
                        <div
                            class="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide backdrop-blur">
                            <span class="size-1.5 rounded-full bg-white"></span>
                            {{ t("auth.register.heading") }}
                        </div>
                        <h2 class="font-heading mb-2 text-3xl font-semibold tracking-tight lg:text-4xl">
                            {{ t("auth.register.heading") }}
                        </h2>
                        <p class="max-w-sm text-sm text-white/85">{{ t("auth.register.subtitle") }}</p>
                    </div>
                </aside>

                <div class="flex flex-col gap-6">
                    <section
                        :class="
                            cn(
                                'bg-card border-border/60 animate-fade-in-scale rounded-2xl border p-8 shadow-lg backdrop-blur-sm',
                            )
                        ">
                        <h1 class="font-heading mb-1 text-2xl font-semibold tracking-tight">
                            {{ t("auth.register.title") }}
                        </h1>
                        <p class="text-muted-foreground mb-6 text-sm">{{ t("auth.register.subtitle") }}</p>

                        <form class="space-y-4" novalidate @submit.prevent="submit">
                            <FormItem>
                                <FormField name="username">
                                    <FormLabel for="username">{{ t("auth.common.username") }}</FormLabel>
                                    <FormControl>
                                        <Input
                                            id="username"
                                            v-model="form.username"
                                            :aria-label="t('auth.common.username')"
                                            autocomplete="username"
                                            name="username"
                                            required />
                                    </FormControl>
                                    <FormMessage />
                                </FormField>
                            </FormItem>

                            <FormItem>
                                <FormField name="email">
                                    <FormLabel for="email">{{ t("auth.common.email") }}</FormLabel>
                                    <FormControl>
                                        <Input
                                            id="email"
                                            v-model="form.email"
                                            :aria-label="t('auth.common.email')"
                                            autocomplete="email"
                                            name="email"
                                            required
                                            type="email" />
                                    </FormControl>
                                    <FormMessage />
                                </FormField>
                            </FormItem>

                            <FormItem>
                                <FormField name="password">
                                    <FormLabel for="password">{{ t("auth.common.password") }}</FormLabel>
                                    <FormControl>
                                        <Input
                                            id="password"
                                            v-model="form.password"
                                            :aria-label="t('auth.common.password')"
                                            autocomplete="new-password"
                                            name="password"
                                            required
                                            type="password" />
                                    </FormControl>
                                    <FormMessage />
                                </FormField>
                            </FormItem>

                            <div v-if="error" class="text-destructive text-sm" role="alert">
                                {{ error }}
                            </div>

                            <div class="pt-2">
                                <Button
                                    :aria-label="t('auth.register.title')"
                                    :as="'button'"
                                    :disabled="loading"
                                    class="bg-brand-gradient hover:shadow-glow w-full font-medium text-white shadow-md transition-all hover:brightness-110 disabled:opacity-70"
                                    type="submit">
                                    <Icon v-if="loading" class="mr-2" name="svg-spinners:180-ring-with-bg" />
                                    {{ loading ? t("auth.register.loading") : t("auth.register.title") }}
                                </Button>
                            </div>
                        </form>

                        <p class="text-muted-foreground mt-6 text-center text-sm">
                            {{ t("auth.register.hasAccount") }}
                            <NuxtLink
                                class="text-primary ml-1 font-medium underline-offset-4 hover:underline"
                                to="/auth/login">
                                {{ t("auth.login.title") }}
                            </NuxtLink>
                        </p>
                    </section>
                </div>
            </div>
        </div>
    </main>
</template>
