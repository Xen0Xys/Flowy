<script lang="ts" setup>
import {onMounted, ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Card, CardContent} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import {
    FAMILY_NAME_MAX_LENGTH,
    FAMILY_NAME_MIN_LENGTH,
    isValidCurrencyCode,
    isValidFamilyName,
    normalizeCurrencyCode,
} from "@/lib/validation";
import {CURRENCY_LOCALES_MAP} from "~/lib/currency";
import {useOnboardingStore} from "@/stores/onboarding.store";
import {useUserStore} from "@/stores/user.store";

definePageMeta({
    layout: "onboarding",
    pageTransition: {name: "fade", mode: "out-in"},
    onboarding: {step: 2},
});

const router = useRouter();
const familyStore = useFamilyStore();
const userStore = useUserStore();
const onboardingStore = useOnboardingStore();
const {t} = useI18n();

const form = ref({name: "", currency: "EUR"});
const loading = ref(false);

onMounted(() => {
    onboardingStore.hydrate();
    if (userStore.hasFamily) {
        router.replace("/onboarding/categories");
        return;
    }
    if (!onboardingStore.mode) {
        onboardingStore.setMode("create");
    }
});

function goBack() {
    router.push("/onboarding/select");
}

function validate() {
    const name = form.value.name.trim();
    const currency = normalizeCurrencyCode(form.value.currency);

    if (!name) {
        toast.error(t("onboarding.create.errors.familyNameRequired"));
        return false;
    }

    if (!isValidFamilyName(name)) {
        toast.error(
            t("onboarding.create.errors.familyNameLength", {
                min: FAMILY_NAME_MIN_LENGTH,
                max: FAMILY_NAME_MAX_LENGTH,
            }),
        );
        return false;
    }

    if (!isValidCurrencyCode(currency)) {
        toast.error(t("onboarding.create.errors.currencyInvalid"));
        return false;
    }

    form.value.name = name;
    form.value.currency = currency;
    return true;
}

async function submit() {
    if (!validate()) return;
    loading.value = true;
    try {
        await familyStore.createFamily({
            name: form.value.name,
            currency: form.value.currency,
        });
        await router.push("/onboarding/categories");
    } catch (err: any) {
        const msg = err?.data?.message ?? err?.message ?? t("onboarding.create.errors.createFailed");
        toast.error(msg);
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <Card :class="cn('w-full self-center', 'max-w-md')">
        <CardContent>
            <header class="text-center">
                <h1 class="font-heading text-2xl font-semibold tracking-tight">
                    {{ t("onboarding.create.title") }}
                </h1>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t("onboarding.create.description") }}
                </p>
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

                <div class="flex justify-between">
                    <Button :as="'button'" type="button" variant="ghost" @click.prevent="goBack">
                        <Icon class="mr-2 h-4 w-4" name="iconoir:arrow-left" />
                        {{ t("common.back") }}
                    </Button>
                    <Button
                        :as="'button'"
                        :disabled="loading"
                        class="bg-brand-gradient hover:shadow-glow text-white hover:brightness-110"
                        type="submit">
                        <Icon v-if="loading" class="mr-2" name="svg-spinners:180-ring-with-bg" />
                        {{ loading ? t("onboarding.create.loading") : t("onboarding.create.create") }}
                    </Button>
                </div>
            </form>
        </CardContent>
    </Card>
</template>
