<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import {DEFAULT_CATEGORIES, type DefaultCategory} from "@/lib/onboarding-defaults";
import {useReferenceStore} from "@/stores/reference.store";
import {useOnboardingStore} from "@/stores/onboarding.store";
import {useUserStore} from "@/stores/user.store";

definePageMeta({
    layout: "onboarding",
    pageTransition: {name: "fade", mode: "out-in"},
    onboarding: {step: 3},
});

type CustomCategory = {
    id: string;
    name: string;
    icon: string;
    hexColor: string;
};

const CUSTOM_DEFAULT_ICON = "iconoir:label";
const CUSTOM_DEFAULT_COLOR = "#64748B";

const router = useRouter();
const referenceStore = useReferenceStore();
const userStore = useUserStore();
const onboardingStore = useOnboardingStore();
const {t} = useI18n();

const selectedKeys = ref<Set<string>>(new Set(DEFAULT_CATEGORIES.filter((c) => c.defaultSelected).map((c) => c.key)));
const customCategories = ref<CustomCategory[]>([]);
const customName = ref("");
const loading = ref(false);

onMounted(() => {
    onboardingStore.hydrate();
    if (!userStore.hasFamily) {
        router.replace("/onboarding");
    }
});

function toggleDefault(key: string) {
    if (selectedKeys.value.has(key)) {
        selectedKeys.value.delete(key);
    } else {
        selectedKeys.value.add(key);
    }
    selectedKeys.value = new Set(selectedKeys.value);
}

function addCustomCategory() {
    const name = customName.value.trim();
    if (!name) return;
    const alreadyExists = customCategories.value.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (alreadyExists) {
        toast.error(t("onboarding.categories.errors.customDuplicate"));
        return;
    }
    customCategories.value.push({
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        icon: CUSTOM_DEFAULT_ICON,
        hexColor: CUSTOM_DEFAULT_COLOR,
    });
    customName.value = "";
}

function removeCustomCategory(id: string) {
    customCategories.value = customCategories.value.filter((c) => c.id !== id);
}

const selectedCount = computed(() => {
    return selectedKeys.value.size + customCategories.value.length;
});

async function submit() {
    const selectedDefaults: DefaultCategory[] = DEFAULT_CATEGORIES.filter((c) => selectedKeys.value.has(c.key));
    const payloads = [
        ...selectedDefaults.map((c) => ({
            name: t(`onboarding.categories.defaults.${c.key}`),
            hexColor: c.hexColor,
            icon: c.icon,
        })),
        ...customCategories.value.map((c) => ({
            name: c.name,
            hexColor: c.hexColor,
            icon: c.icon,
        })),
    ];

    if (payloads.length === 0) {
        await router.push("/onboarding/invite");
        return;
    }

    loading.value = true;
    try {
        const {created, failed} = await referenceStore.bulkCreateCategories(payloads);
        if (failed.length === 0) {
            toast.success(t("onboarding.categories.summary.success", {count: created.length}));
        } else if (created.length > 0) {
            toast.warning(t("onboarding.categories.summary.partial", {success: created.length, failed: failed.length}));
        } else {
            toast.error(t("onboarding.categories.summary.failed"));
        }
        await router.push("/onboarding/invite");
    } finally {
        loading.value = false;
    }
}

async function skip() {
    await router.push("/onboarding/invite");
}
</script>

<template>
    <Card :class="cn('w-full self-center', 'max-w-2xl')">
        <CardContent class="flex flex-col gap-6 p-6">
            <header class="flex flex-col gap-1 text-center">
                <h1 class="font-heading text-2xl font-semibold tracking-tight">
                    {{ t("onboarding.categories.title") }}
                </h1>
                <p class="text-muted-foreground text-sm">
                    {{ t("onboarding.categories.description") }}
                </p>
            </header>

            <section class="flex flex-col gap-2">
                <h2 class="text-sm font-medium">{{ t("onboarding.categories.suggestedSection") }}</h2>
                <div class="stagger-children grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <button
                        v-for="(cat, i) in DEFAULT_CATEGORIES"
                        :key="cat.key"
                        type="button"
                        :aria-pressed="selectedKeys.has(cat.key)"
                        :style="{'--stagger-index': i}"
                        :class="
                            cn(
                                'group relative flex items-center gap-2 rounded-lg border p-3 text-left transition-all',
                                selectedKeys.has(cat.key)
                                    ? 'border-primary bg-primary/5 shadow-sm'
                                    : 'border-border hover:border-primary/40 hover:bg-muted/40',
                            )
                        "
                        @click="toggleDefault(cat.key)">
                        <span
                            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                            :style="{backgroundColor: `${cat.hexColor}1A`, color: cat.hexColor}">
                            <Icon class="h-4 w-4" :name="cat.icon" />
                        </span>
                        <span class="min-w-0 flex-1 truncate text-sm font-medium">
                            {{ t(`onboarding.categories.defaults.${cat.key}`) }}
                        </span>
                        <Icon
                            v-if="selectedKeys.has(cat.key)"
                            class="text-primary h-4 w-4 shrink-0"
                            name="iconoir:check-circle-solid" />
                    </button>
                </div>
            </section>

            <section class="flex flex-col gap-2">
                <h2 class="text-sm font-medium">{{ t("onboarding.categories.customSection") }}</h2>
                <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="addCustomCategory">
                    <Input
                        v-model="customName"
                        :placeholder="t('onboarding.categories.customPlaceholder')"
                        maxlength="50" />
                    <Button :as="'button'" type="submit" variant="outline" :disabled="!customName.trim()">
                        <Icon class="mr-2 h-4 w-4" name="iconoir:plus" />
                        {{ t("onboarding.categories.addCustom") }}
                    </Button>
                </form>
                <ul v-if="customCategories.length" class="flex flex-wrap gap-2">
                    <li
                        v-for="c in customCategories"
                        :key="c.id"
                        class="border-primary/40 bg-primary/5 flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                        <Icon class="text-primary h-3 w-3" :name="c.icon" />
                        <span>{{ c.name }}</span>
                        <button
                            type="button"
                            class="text-muted-foreground hover:text-destructive"
                            :aria-label="t('onboarding.categories.removeCustom', {name: c.name})"
                            @click="removeCustomCategory(c.id)">
                            <Icon class="h-3.5 w-3.5" name="iconoir:xmark" />
                        </button>
                    </li>
                </ul>
            </section>

            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex items-center gap-2">
                    <Button :as="'button'" type="button" variant="ghost" :disabled="loading" @click.prevent="skip">
                        {{ t("onboarding.categories.skip") }}
                    </Button>
                    <span v-if="selectedCount > 0" class="text-muted-foreground text-xs">
                        {{ t("onboarding.categories.selectedCount", {count: selectedCount}) }}
                    </span>
                </div>
                <Button
                    :as="'button'"
                    type="button"
                    :disabled="loading"
                    class="bg-brand-gradient hover:shadow-glow text-white hover:brightness-110"
                    @click="submit">
                    <Icon v-if="loading" class="mr-2" name="svg-spinners:180-ring-with-bg" />
                    {{ loading ? t("onboarding.categories.creating") : t("onboarding.categories.continue") }}
                    <Icon v-if="!loading" class="ml-2 h-4 w-4" name="iconoir:arrow-right" />
                </Button>
            </div>
        </CardContent>
    </Card>
</template>
