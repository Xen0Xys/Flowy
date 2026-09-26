<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {Button} from "@/components/ui/button";
import {useSsoStore, type SsoPublicProvider} from "@/stores/sso.store";

const props = defineProps<{
    mode?: "login" | "register";
}>();

const {t} = useI18n();
const store = useSsoStore();
const loading = ref(true);
const providers = ref<SsoPublicProvider[]>([]);

const mode = computed(() => props.mode ?? "login");

onMounted(async () => {
    loading.value = true;
    try {
        providers.value = await store.fetchProviders();
    } finally {
        loading.value = false;
    }
});

function openProvider(slug: string) {
    const url = store.buildLoginStartUrl(slug);
    window.location.assign(url);
}
</script>

<template>
    <div v-if="!loading && providers.length > 0" class="mt-6 space-y-4">
        <div class="flex items-center gap-3">
            <span class="bg-border h-px flex-1"></span>
            <span class="text-muted-foreground text-xs uppercase">
                {{ mode === "register" ? t("sso.registerDivider") : t("sso.loginDivider") }}
            </span>
            <span class="bg-border h-px flex-1"></span>
        </div>
        <div class="grid grid-cols-1 gap-2">
            <Button
                v-for="provider in providers"
                :key="provider.slug"
                :aria-label="t('sso.continueWith', {name: provider.displayName})"
                class="w-full justify-center gap-2"
                type="button"
                variant="outline"
                @click="openProvider(provider.slug)">
                <Icon :name="provider.icon" class="size-5" />
                <span>{{ t("sso.continueWith", {name: provider.displayName}) }}</span>
            </Button>
        </div>
    </div>
</template>
