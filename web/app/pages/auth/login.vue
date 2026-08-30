<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {useAuthStore} from "@/stores/auth.store";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {isValidEmail} from "@/lib/validation";
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";

definePageMeta({
    layout: "auth",
    pageTransition: {name: "fade", mode: "out-in", appear: true},
});

const router = useRouter();
const store = useAuthStore();
const {t} = useI18n();

const form = ref({email: "", password: ""});
const loading = ref(false);
const error = ref<string | null>(null);

function validate() {
    const email = form.value.email.trim();

    if (!email || !form.value.password) {
        const msg = t("auth.login.errors.required");
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

    form.value.email = email;
    return true;
}

async function submit() {
    error.value = null;
    if (!validate()) return;
    loading.value = true;
    try {
        await store.login({
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
            {{ t("auth.login.title") }}
        </h1>
        <p class="text-muted-foreground mb-6 text-sm">{{ t("auth.login.subtitle") }}</p>

        <form class="space-y-4" novalidate @submit.prevent="submit">
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
                            autocomplete="current-password"
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
                    :aria-label="t('auth.login.title')"
                    :as="'button'"
                    :disabled="loading"
                    class="bg-brand-gradient hover:shadow-glow w-full font-medium text-white shadow-md transition-all hover:brightness-110 disabled:opacity-70"
                    type="submit">
                    <Icon v-if="loading" class="mr-2" name="svg-spinners:180-ring-with-bg" />
                    {{ loading ? t("auth.login.loading") : t("auth.login.title") }}
                </Button>
            </div>
        </form>

        <p class="text-muted-foreground mt-6 text-center text-sm">
            {{ t("auth.login.noAccount") }}
            <NuxtLink class="text-primary ml-1 font-medium underline-offset-4 hover:underline" to="/auth/register">
                {{ t("auth.register.title") }}
            </NuxtLink>
        </p>
    </section>
</template>
