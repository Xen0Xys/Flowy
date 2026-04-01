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

const bgImage = "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&q=80&auto=format&fit=crop";

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
        // store.register already shows a toast for server validation; keep inline error cleared
        error.value = null;
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <main :class="cn('flex min-h-screen items-center justify-center p-6')">
        <div class="flex w-full max-w-5xl flex-col items-center gap-6">
            <div class="text-center">
                <div class="text-5xl font-semibold tracking-tight md:text-6xl">Flowy</div>
            </div>
            <div :class="cn('grid w-full grid-cols-1 gap-8 md:grid-cols-2')">
                <aside class="relative hidden items-center justify-center overflow-hidden rounded-lg md:flex">
                    <img
                        :src="bgImage"
                        :alt="t('auth.register.backgroundAlt')"
                        class="absolute inset-0 h-full w-full object-cover opacity-80" />
                    <div class="relative z-10 p-8 text-center text-white">
                        <h2 class="mb-2 text-3xl font-bold">{{ t("auth.register.heading") }}</h2>
                        <p class="text-sm opacity-90">{{ t("auth.register.subtitle") }}</p>
                    </div>
                    <div class="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
                </aside>

                <div class="flex flex-col gap-6">
                    <section :class="cn('bg-card rounded-lg p-8 shadow-lg')">
                        <h1 class="mb-6 text-2xl font-semibold">{{ t("auth.register.title") }}</h1>

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
                                    :as="'button'"
                                    :disabled="loading"
                                    :aria-label="t('auth.register.title')"
                                    type="submit">
                                    {{ loading ? t("auth.register.loading") : t("auth.register.title") }}
                                </Button>
                            </div>
                        </form>

                        <p class="mt-4 text-sm">
                            {{ t("auth.register.hasAccount") }}
                            <NuxtLink class="text-primary underline" to="/auth/login">{{
                                t("auth.login.title")
                            }}</NuxtLink>
                        </p>
                    </section>
                </div>
            </div>
        </div>
    </main>
</template>
