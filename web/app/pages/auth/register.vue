<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {useAuthStore} from "@/stores/auth.store";
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

definePageMeta({
    layout: "auth",
    pageTransition: {name: "fade", mode: "out-in", appear: true},
});

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
    <section class="bg-card border-border/60 rounded-2xl border p-8 shadow-lg backdrop-blur-sm">
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
            <NuxtLink class="text-primary ml-1 font-medium underline-offset-4 hover:underline" to="/auth/login">
                {{ t("auth.login.title") }}
            </NuxtLink>
        </p>
    </section>
</template>
