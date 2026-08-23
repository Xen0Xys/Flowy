<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent} from "~/components/ui/card";
import {cn} from "@/lib/utils";
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "~/components/ui/form";
import {isValidEmail} from "@/lib/validation";

definePageMeta({
    layout: "onboarding",
    pageTransition: {name: "fade", mode: "out-in"},
    onboarding: {step: 2},
});

const router = useRouter();
const familyStore = useFamilyStore();
const {t} = useI18n();

const loading = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const invitedCount = ref(0);

function validate() {
    const email = form.value.email.trim();

    if (!email) {
        const msg = t("auth.common.errors.emailRequired");
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

const form = ref({email: ""});

async function submit() {
    error.value = null;
    success.value = null;
    if (!validate()) return;
    loading.value = true;
    try {
        await familyStore.inviteMember(form.value.email);
        invitedCount.value += 1;
        form.value.email = "";
    } catch (err: any) {
        const msg = err?.data?.message ?? err?.message ?? t("onboarding.invite.errors.sendFailed");
        toast.error(msg);
        error.value = null;
    } finally {
        loading.value = false;
    }
}

function skip() {
    router.push("/");
}
</script>

<template>
    <Card :class="cn('w-full self-center', 'max-w-md')">
        <CardContent>
            <header class="text-center">
                <h1 class="font-heading text-2xl font-semibold tracking-tight">
                    {{ t("onboarding.invite.title") }}
                </h1>
            </header>

            <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
                <FormItem>
                    <FormField name="email">
                        <FormLabel for="email">{{ t("onboarding.invite.memberEmail") }}</FormLabel>
                        <FormControl>
                            <Input
                                id="email"
                                v-model="form.email"
                                autofocus
                                :placeholder="t('onboarding.invite.memberEmailPlaceholder')"
                                required
                                type="email" />
                        </FormControl>
                        <FormMessage />
                    </FormField>
                </FormItem>

                <div v-if="error" class="text-destructive text-sm" role="alert">
                    {{ error }}
                </div>

                <div class="flex items-center justify-end gap-2">
                    <Button
                        :as="'button'"
                        :disabled="loading"
                        class="bg-brand-gradient hover:shadow-glow text-white hover:brightness-110"
                        type="submit">
                        <Icon v-if="loading" class="mr-2" name="svg-spinners:180-ring-with-bg" />
                        {{ loading ? t("onboarding.invite.sending") : t("onboarding.invite.send") }}
                    </Button>
                    <Button :as="'button'" type="button" variant="outline" @click.prevent="skip">
                        {{ invitedCount > 0 ? t("onboarding.invite.continue") : t("onboarding.invite.skip") }}
                    </Button>
                </div>
            </form>
        </CardContent>
    </Card>
</template>
