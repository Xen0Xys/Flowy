<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {useRoute, useRouter} from "#app";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {useSsoStore, type SsoIdentity, type SsoPublicProvider} from "@/stores/sso.store";

const {t, locale} = useI18n();
const store = useSsoStore();
const route = useRoute();
const router = useRouter();

const loading = ref(true);
const identities = ref<SsoIdentity[]>([]);
const providers = ref<SsoPublicProvider[]>([]);
const unlinking = ref<string | null>(null);

const linkedSlugs = computed(() => new Set(identities.value.map((identity) => identity.providerSlug)));
const availableToLink = computed(() => providers.value.filter((provider) => !linkedSlugs.value.has(provider.slug)));

function formatDate(iso: string | null | undefined): string {
    if (!iso) return "-";
    try {
        return new Intl.DateTimeFormat(locale.value, {dateStyle: "medium", timeStyle: "short"}).format(new Date(iso));
    } catch {
        return iso;
    }
}

async function refresh() {
    loading.value = true;
    try {
        const [id, prov] = await Promise.all([store.fetchIdentities(true), store.fetchProviders(true)]);
        identities.value = id;
        providers.value = prov;
    } finally {
        loading.value = false;
    }
}

async function link(slug: string) {
    try {
        const url = await store.requestLinkStartUrl(slug);
        window.location.assign(url);
    } catch {
        // Toast handled inside the store.
    }
}

async function unlink(identity: SsoIdentity) {
    if (!confirm(t("sso.profile.confirmUnlink", {name: identity.providerDisplayName}))) return;
    unlinking.value = identity.id;
    try {
        await store.unlinkIdentity(identity.id);
        identities.value = identities.value.filter((entry) => entry.id !== identity.id);
    } finally {
        unlinking.value = null;
    }
}

function consumeSsoQuery() {
    const status = route.query.sso;
    if (status === "ok") {
        toast.success(t("sso.toasts.linked", {name: String(route.query.detail ?? "")}));
    } else if (status === "error") {
        const code = String(route.query.detail ?? "internal");
        const localized = t(`sso.errors.${code}`, "");
        toast.error(localized && localized !== `sso.errors.${code}` ? localized : t("sso.errors.internal"));
    }
    if (status !== undefined) {
        void router.replace({query: {...route.query, sso: undefined, detail: undefined}});
    }
}

onMounted(async () => {
    consumeSsoQuery();
    await refresh();
});
</script>

<template>
    <Card v-if="loading || providers.length > 0 || identities.length > 0">
        <CardHeader>
            <CardTitle>{{ t("sso.profile.title") }}</CardTitle>
            <CardDescription>{{ t("sso.profile.description") }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
            <div v-if="loading" class="text-muted-foreground flex items-center gap-2 text-sm">
                <Icon name="svg-spinners:180-ring-with-bg" class="size-4" />
                {{ t("common.loading") }}
            </div>

            <div v-else-if="identities.length > 0" class="space-y-2">
                <div
                    v-for="identity in identities"
                    :key="identity.id"
                    class="border-border/60 flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div class="flex min-w-0 items-center gap-3">
                        <div class="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
                            <Icon :name="identity.providerIcon" class="size-5" />
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <p class="truncate text-sm font-medium">{{ identity.providerDisplayName }}</p>
                                <Badge variant="secondary">{{ t("sso.profile.linked") }}</Badge>
                            </div>
                            <p class="text-muted-foreground truncate text-xs">
                                {{ identity.emailAtLink ?? t("sso.profile.noEmail") }}
                            </p>
                            <p class="text-muted-foreground truncate text-xs">
                                {{ t("sso.profile.linkedOn", {date: formatDate(identity.linkedAt)}) }}
                            </p>
                        </div>
                    </div>
                    <Button
                        :aria-label="t('sso.profile.unlink', {name: identity.providerDisplayName})"
                        :disabled="unlinking === identity.id"
                        size="sm"
                        type="button"
                        variant="outline"
                        @click="unlink(identity)">
                        <Icon
                            v-if="unlinking === identity.id"
                            class="mr-1 size-4"
                            name="svg-spinners:180-ring-with-bg" />
                        {{ t("sso.profile.unlinkAction") }}
                    </Button>
                </div>
            </div>

            <div v-else class="text-muted-foreground text-sm">
                {{ t("sso.profile.noneLinked") }}
            </div>

            <div v-if="!loading && availableToLink.length > 0" class="border-border/60 border-t pt-4">
                <p class="text-muted-foreground mb-2 text-xs">{{ t("sso.profile.linkNew") }}</p>
                <div class="flex flex-wrap gap-2">
                    <Button
                        v-for="provider in availableToLink"
                        :key="provider.slug"
                        size="sm"
                        type="button"
                        variant="outline"
                        @click="link(provider.slug)">
                        <Icon :name="provider.icon" class="mr-1 size-4" />
                        {{ t("sso.profile.linkWith", {name: provider.displayName}) }}
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
