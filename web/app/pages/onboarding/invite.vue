<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    Stepper,
    StepperDescription,
    StepperIndicator,
    StepperItem,
    StepperTitle,
    StepperTrigger,
} from "@/components/ui/stepper";
import {Card} from "~/components/ui/card";
import {cn} from "@/lib/utils";
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "~/components/ui/form";
import {isValidEmail} from "@/lib/validation";

const router = useRouter();
const familyStore = useFamilyStore();
const {t} = useI18n();

const loading = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const invitedCount = ref(0);

const steps = [
    {title: t("onboarding.steps.welcome.title"), description: t("onboarding.steps.welcome.description")},
    {title: t("onboarding.steps.createJoin.title"), description: t("onboarding.steps.createJoin.description")},
    {title: t("onboarding.steps.invite.title"), description: t("onboarding.steps.invite.description")},
];

const active = ref(2);

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
    // proceed to home even if no invites sent
    router.push("/");
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

        <Card :class="cn('w-full self-center', 'max-w-md')" :innerClass="cn('p-6')">
            <header class="text-center">
                <h1 class="text-2xl font-semibold">{{ t("onboarding.invite.title") }}</h1>
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
                    <Button :as="'button'" :disabled="loading" type="submit">{{
                        loading ? t("onboarding.invite.sending") : t("onboarding.invite.send")
                    }}</Button>
                    <Button :as="'button'" type="button" variant="outline" @click.prevent="skip">{{
                        invitedCount > 0 ? t("onboarding.invite.continue") : t("onboarding.invite.skip")
                    }}</Button>
                </div>
            </form>
        </Card>
    </div>
</template>
