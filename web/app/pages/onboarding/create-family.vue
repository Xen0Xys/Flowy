<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {
    Stepper,
    StepperDescription,
    StepperIndicator,
    StepperItem,
    StepperTitle,
    StepperTrigger,
} from "@/components/ui/stepper";
import {Card} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import {
    FAMILY_NAME_MAX_LENGTH,
    FAMILY_NAME_MIN_LENGTH,
    isValidCurrencyCode,
    isValidFamilyName,
    normalizeCurrencyCode,
} from "@/lib/validation";
import {CURRENCY_LOCALES_MAP} from "~/lib/currency";

const router = useRouter();
const familyStore = useFamilyStore();
const {t} = useI18n();

const form = ref({name: "", currency: "EUR"});
const loading = ref(false);
const error = ref<string | null>(null);

const steps = [
    {title: t("onboarding.steps.welcome.title"), description: t("onboarding.steps.welcome.description")},
    {title: t("onboarding.steps.createJoin.title"), description: t("onboarding.steps.createJoin.description")},
    {title: t("onboarding.steps.invite.title"), description: t("onboarding.steps.invite.description")},
];

// stepper indexes the steps from 0 in the template loop, start at 0 so
// the first step is active by default
const active = ref(0);

// rely on global background token

function goBack() {
    router.push("/onboarding/select");
}

function validate() {
    const name = form.value.name.trim();
    const currency = normalizeCurrencyCode(form.value.currency);

    if (!name) {
        const msg = t("onboarding.create.errors.familyNameRequired");
        toast.error(msg);
        // remove inline error when using toast
        error.value = null;
        return false;
    }

    if (!isValidFamilyName(name)) {
        const msg = t("onboarding.create.errors.familyNameLength", {
            min: FAMILY_NAME_MIN_LENGTH,
            max: FAMILY_NAME_MAX_LENGTH,
        });
        toast.error(msg);
        error.value = null;
        return false;
    }

    if (!isValidCurrencyCode(currency)) {
        const msg = t("onboarding.create.errors.currencyInvalid");
        toast.error(msg);
        error.value = null;
        return false;
    }

    form.value.name = name;
    form.value.currency = currency;
    return true;
}

async function submit() {
    error.value = null;
    if (!validate()) return;
    loading.value = true;
    try {
        await familyStore.createFamily({
            name: form.value.name,
            currency: form.value.currency,
        });
        await router.push("/onboarding/invite");
    } catch (err: any) {
        const msg = err?.data?.message ?? err?.message ?? t("onboarding.create.errors.createFailed");
        toast.error(msg);
        // ensure no inline error is left visible when using toast
        error.value = null;
    } finally {
        loading.value = false;
    }
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
                <h1 class="text-2xl font-semibold">{{ t("onboarding.create.title") }}</h1>
            </header>
            <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
                <FormItem>
                    <FormField name="name">
                        <FormLabel for="name">{{ t("onboarding.create.familyName") }}</FormLabel>
                        <FormControl>
                            <Input id="name" v-model="form.name" autofocus required />
                        </FormControl>
                        <FormMessage />
                    </FormField>
                </FormItem>

                <FormItem>
                    <FormField name="currency">
                        <FormLabel for="currency">{{ t("onboarding.create.currency") }}</FormLabel>
                        <FormControl>
                            <Select v-model="form.currency">
                                <SelectTrigger id="currency">
                                    <SelectValue :placeholder="t('onboarding.create.selectCurrency')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <template v-for="code in Object.keys(CURRENCY_LOCALES_MAP)" :key="code">
                                            <SelectItem :value="code">{{ code }}</SelectItem>
                                        </template>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </FormControl>
                        <FormMessage />
                    </FormField>
                </FormItem>

                <div v-if="error" class="text-destructive text-sm" role="alert">
                    {{ error }}
                </div>

                <div class="flex justify-between">
                    <Button :as="'button'" type="button" variant="destructive" @click.prevent="goBack">
                        {{ t("common.back") }}
                    </Button>
                    <Button :as="'button'" :disabled="loading" type="submit">{{
                        loading ? t("onboarding.create.loading") : t("onboarding.create.create")
                    }}</Button>
                </div>
            </form>
        </Card>
    </div>
</template>
