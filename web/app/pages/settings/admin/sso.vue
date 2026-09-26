<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {useClipboard} from "@vueuse/core";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {useSsoStore, type SsoAdminProvider} from "@/stores/sso.store";

definePageMeta({
    middleware: ["admin"],
});

const {t} = useI18n();
const store = useSsoStore();
const {copy} = useClipboard();
const loading = ref(true);
const providers = ref<SsoAdminProvider[]>([]);

const enabledCount = computed(() => providers.value.length);

async function load() {
    loading.value = true;
    try {
        providers.value = await store.fetchAdminProviders(true);
    } finally {
        loading.value = false;
    }
}

async function copyCallback(url: string) {
    await copy(url);
    toast.success(t("sso.admin.toasts.callbackCopied"));
}

onMounted(load);
</script>

<template>
    <div class="w-full">
        <div class="mx-auto w-full max-w-4xl space-y-6 py-6">
            <div class="flex items-center gap-3">
                <div class="relative">
                    <span aria-hidden="true" class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
                    <div
                        class="bg-brand-gradient-soft border-border/60 relative flex size-12 items-center justify-center rounded-xl border">
                        <Icon class="text-primary size-6" name="iconoir:lock-key" />
                    </div>
                </div>
                <div>
                    <h1 class="font-heading text-2xl font-semibold tracking-tight">
                        {{ t("sso.admin.title") }}
                    </h1>
                    <p class="text-muted-foreground text-sm">{{ t("sso.admin.subtitle") }}</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <CardTitle>{{ t("sso.admin.status.title") }}</CardTitle>
                            <CardDescription>{{ t("sso.admin.status.description") }}</CardDescription>
                        </div>
                        <Badge :variant="enabledCount > 0 ? 'default' : 'outline'">
                            {{ t("sso.admin.status.count", {count: enabledCount}) }}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <p class="text-muted-foreground text-sm">
                        {{ t("sso.admin.status.envHint") }}
                    </p>
                </CardContent>
            </Card>

            <Card v-if="loading">
                <CardContent class="flex items-center gap-2 py-6">
                    <Icon class="size-4" name="svg-spinners:180-ring-with-bg" />
                    <span class="text-muted-foreground text-sm">{{ t("common.loading") }}</span>
                </CardContent>
            </Card>

            <Card v-else-if="providers.length === 0">
                <CardHeader>
                    <CardTitle>{{ t("sso.admin.empty.title") }}</CardTitle>
                    <CardDescription>{{ t("sso.admin.empty.description") }}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p class="text-muted-foreground text-sm">{{ t("sso.admin.empty.hint") }}</p>
                </CardContent>
            </Card>

            <Card v-for="provider in providers" v-else :key="provider.slug">
                <CardHeader>
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex items-start gap-3">
                            <div class="bg-muted flex size-10 items-center justify-center rounded-md">
                                <Icon :name="provider.icon" class="size-5" />
                            </div>
                            <div>
                                <CardTitle class="flex flex-wrap items-center gap-2">
                                    {{ provider.displayName }}
                                    <Badge variant="secondary">{{ provider.kind.toUpperCase() }}</Badge>
                                    <Badge variant="outline">{{ provider.slug }}</Badge>
                                </CardTitle>
                                <CardDescription>
                                    {{ t("sso.admin.provider.envSource") }}
                                </CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent class="space-y-4">
                    <dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div class="border-border/60 rounded-lg border p-3">
                            <dt class="text-muted-foreground text-xs">{{ t("sso.admin.provider.scopes") }}</dt>
                            <dd class="mt-1 font-mono text-xs break-all">{{ provider.scopes.join(", ") }}</dd>
                        </div>
                        <div class="border-border/60 rounded-lg border p-3">
                            <dt class="text-muted-foreground text-xs">{{ t("sso.admin.provider.signup") }}</dt>
                            <dd class="mt-1 text-sm">
                                {{
                                    provider.allowSignup
                                        ? t("sso.admin.provider.signupAllowed")
                                        : t("sso.admin.provider.signupDisallowed")
                                }}
                            </dd>
                        </div>
                        <div
                            v-if="provider.allowedEmailDomains.length > 0"
                            class="border-border/60 rounded-lg border p-3 sm:col-span-2">
                            <dt class="text-muted-foreground text-xs">{{ t("sso.admin.provider.domains") }}</dt>
                            <dd class="mt-1 font-mono text-xs break-all">
                                {{ provider.allowedEmailDomains.join(", ") }}
                            </dd>
                        </div>
                        <div v-if="provider.discoveryUrl" class="border-border/60 rounded-lg border p-3 sm:col-span-2">
                            <dt class="text-muted-foreground text-xs">{{ t("sso.admin.provider.discoveryUrl") }}</dt>
                            <dd class="mt-1 font-mono text-xs break-all">{{ provider.discoveryUrl }}</dd>
                        </div>
                        <template v-if="provider.kind === 'oauth2'">
                            <div
                                v-if="provider.authorizationUrl"
                                class="border-border/60 rounded-lg border p-3 sm:col-span-2">
                                <dt class="text-muted-foreground text-xs">
                                    {{ t("sso.admin.provider.authorizationUrl") }}
                                </dt>
                                <dd class="mt-1 font-mono text-xs break-all">{{ provider.authorizationUrl }}</dd>
                            </div>
                            <div v-if="provider.tokenUrl" class="border-border/60 rounded-lg border p-3 sm:col-span-2">
                                <dt class="text-muted-foreground text-xs">{{ t("sso.admin.provider.tokenUrl") }}</dt>
                                <dd class="mt-1 font-mono text-xs break-all">{{ provider.tokenUrl }}</dd>
                            </div>
                            <div
                                v-if="provider.userinfoUrl"
                                class="border-border/60 rounded-lg border p-3 sm:col-span-2">
                                <dt class="text-muted-foreground text-xs">{{ t("sso.admin.provider.userinfoUrl") }}</dt>
                                <dd class="mt-1 font-mono text-xs break-all">{{ provider.userinfoUrl }}</dd>
                            </div>
                            <div v-if="provider.emailsUrl" class="border-border/60 rounded-lg border p-3 sm:col-span-2">
                                <dt class="text-muted-foreground text-xs">{{ t("sso.admin.provider.emailsUrl") }}</dt>
                                <dd class="mt-1 font-mono text-xs break-all">{{ provider.emailsUrl }}</dd>
                            </div>
                        </template>
                    </dl>
                    <div class="border-border/60 flex flex-col gap-2 rounded-lg border p-3">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-muted-foreground text-xs">{{ t("sso.admin.provider.callback") }}</p>
                                <p class="mt-1 font-mono text-xs break-all">{{ provider.callbackUrl }}</p>
                            </div>
                            <Button
                                :aria-label="t('sso.admin.provider.copyCallback')"
                                :title="t('sso.admin.provider.copyCallback')"
                                size="icon"
                                variant="ghost"
                                @click="copyCallback(provider.callbackUrl)">
                                <Icon class="size-4" name="iconoir:copy" />
                            </Button>
                        </div>
                        <p class="text-muted-foreground text-xs">
                            {{ t("sso.admin.provider.callbackHint") }}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
</template>
