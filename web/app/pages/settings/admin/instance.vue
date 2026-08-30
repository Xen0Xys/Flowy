<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {useUserStore} from "~/stores/user.store";
import {useApi} from "~/composables/useApi";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {Badge} from "@/components/ui/badge";
import {Label} from "@/components/ui/label";
import {Avatar, AvatarFallback} from "@/components/ui/avatar";
import {
    Combobox,
    ComboboxAnchor,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxTrigger,
    ComboboxViewport,
} from "@/components/ui/combobox";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {toast} from "vue-sonner";
import {useClipboard} from "@vueuse/core";
import {ChevronsUpDown} from "lucide-vue-next";

type AdminUser = {
    id: string;
    username: string;
    email: string;
    familyId: string | null;
    familyRole: string | null;
};

const userStore = useUserStore();
const {apiFetch} = useApi();
const config = useRuntimeConfig();
const {t} = useI18n();
const {copy} = useClipboard();

const frontendVersion = computed(() => config.public.appVersion as string);
const backendVersion = ref("...");

const loading = ref(false);
const registrationEnabled = ref(true);
const savingRegistration = ref(false);

const ownerId = ref("");
const pendingOwnerId = ref<string | null>(null);
const savingOwner = ref(false);
const ownerChangeDialogOpen = ref(false);

const users = ref<AdminUser[]>([]);

const currentOwner = computed(() => users.value.find((u) => u.id === ownerId.value) ?? null);
const pendingOwner = computed(() => users.value.find((u) => u.id === pendingOwnerId.value) ?? null);

function computeInitials(name: string | undefined | null): string {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return "?";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

async function load() {
    if (!userStore.token) return;
    loading.value = true;
    try {
        const s = await userStore.getInstanceSettings();
        ownerId.value = s?.instanceOwner ?? "";
        registrationEnabled.value = !!s?.registrationEnabled;

        try {
            users.value = ((await userStore.listAdminUsers()) as AdminUser[]) ?? [];
        } catch {
            users.value = [];
        }

        try {
            const data = await apiFetch<{version: string}>("/version");
            backendVersion.value = data.version;
        } catch {
            backendVersion.value = t("settings.instance.unknown");
        }
    } finally {
        loading.value = false;
    }
}

onMounted(load);

async function onRegistrationChange(value: boolean) {
    registrationEnabled.value = value;
    savingRegistration.value = true;
    try {
        await userStore.updateRegistrationEnabled(value);
    } catch {
        registrationEnabled.value = !value;
    } finally {
        savingRegistration.value = false;
    }
}

function requestOwnerChange(value: string | number | boolean | Array<string | number | boolean>) {
    const next = String(value);
    if (!next || next === ownerId.value) return;
    pendingOwnerId.value = next;
    ownerChangeDialogOpen.value = true;
}

function cancelOwnerChange() {
    pendingOwnerId.value = null;
    ownerChangeDialogOpen.value = false;
}

async function confirmOwnerChange() {
    if (!pendingOwnerId.value) return;
    savingOwner.value = true;
    try {
        await userStore.updateInstanceOwner(pendingOwnerId.value);
        ownerId.value = pendingOwnerId.value;
        pendingOwnerId.value = null;
        ownerChangeDialogOpen.value = false;
    } finally {
        savingOwner.value = false;
    }
}

async function copyVersions() {
    const text = `Web: ${frontendVersion.value}\nServer: ${backendVersion.value}`;
    await copy(text);
    toast.success(t("settings.instance.toasts.versionsCopied"));
}
</script>

<template>
    <div class="w-full">
        <div class="animate-fade-in-up mx-auto w-full max-w-4xl space-y-6 py-6">
            <div class="flex items-center gap-3">
                <div class="relative">
                    <span aria-hidden="true" class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
                    <div
                        class="bg-brand-gradient-soft border-border/60 relative flex size-12 items-center justify-center rounded-xl border">
                        <Icon class="text-primary size-6" name="iconoir:server" />
                    </div>
                </div>
                <div>
                    <h1 class="font-heading text-2xl font-semibold tracking-tight">
                        {{ t("settings.instance.title") }}
                    </h1>
                    <p class="text-muted-foreground text-sm">{{ t("settings.instance.subtitle") }}</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{{ t("settings.instance.registration") }}</CardTitle>
                    <CardDescription>{{ t("settings.instance.registrationDescription") }}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div class="flex items-center justify-between gap-4">
                        <div class="flex items-center gap-3">
                            <Badge :variant="registrationEnabled ? 'default' : 'outline'">
                                {{
                                    registrationEnabled
                                        ? t("settings.instance.registrationOn")
                                        : t("settings.instance.registrationOff")
                                }}
                            </Badge>
                        </div>
                        <Switch
                            :aria-label="t('settings.instance.registrationEnabled')"
                            :disabled="savingRegistration || loading"
                            :model-value="registrationEnabled"
                            @update:model-value="onRegistrationChange" />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{{ t("settings.instance.owner") }}</CardTitle>
                    <CardDescription>{{ t("settings.instance.ownerDescription") }}</CardDescription>
                </CardHeader>
                <CardContent class="space-y-4">
                    <div v-if="currentOwner" class="border-border/60 flex items-center gap-3 rounded-lg border p-3">
                        <Avatar class="size-10 shrink-0">
                            <AvatarFallback class="text-xs font-semibold">
                                {{ computeInitials(currentOwner.username) }}
                            </AvatarFallback>
                        </Avatar>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2">
                                <p class="truncate text-sm font-medium">{{ currentOwner.username }}</p>
                                <Badge variant="default">{{ t("settings.instance.currentOwner") }}</Badge>
                            </div>
                            <p class="text-muted-foreground truncate text-xs">{{ currentOwner.email }}</p>
                        </div>
                    </div>
                    <div
                        v-else-if="ownerId"
                        class="border-border/60 flex items-center justify-between gap-3 rounded-lg border p-3">
                        <div class="min-w-0">
                            <p class="text-muted-foreground truncate font-mono text-xs">{{ ownerId }}</p>
                        </div>
                        <Badge variant="outline">{{ t("settings.instance.currentOwner") }}</Badge>
                    </div>

                    <div class="space-y-2">
                        <Label for="instance-owner-picker">{{ t("settings.instance.searchOwner") }}</Label>
                        <Combobox :reset-search-term-on-select="true" @update:model-value="requestOwnerChange">
                            <ComboboxAnchor as-child>
                                <ComboboxTrigger as-child>
                                    <Button
                                        id="instance-owner-picker"
                                        :disabled="loading || users.length === 0"
                                        class="w-full justify-between font-normal"
                                        type="button"
                                        variant="outline">
                                        <span class="text-muted-foreground truncate">
                                            {{ t("settings.instance.selectOwner") }}
                                        </span>
                                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </ComboboxTrigger>
                            </ComboboxAnchor>
                            <ComboboxList
                                class="*:data-[slot=input-group]:!m-0 *:data-[slot=input-group]:!rounded-none *:data-[slot=input-group]:!border-x-0 *:data-[slot=input-group]:!border-t-0">
                                <ComboboxInput
                                    :placeholder="t('settings.instance.searchOwner')"
                                    class="text-base !outline-none focus:!ring-0 focus:!outline-none focus-visible:!ring-0 focus-visible:!outline-none md:text-sm" />
                                <ComboboxEmpty>{{ t("settings.users.noUsers") }}</ComboboxEmpty>
                                <ComboboxViewport>
                                    <ComboboxGroup>
                                        <ComboboxItem
                                            v-for="user in users"
                                            :key="user.id"
                                            :disabled="user.id === ownerId"
                                            :value="user.id">
                                            <div class="flex min-w-0 flex-1 items-center gap-2">
                                                <Avatar class="size-6 shrink-0">
                                                    <AvatarFallback class="text-[10px] font-semibold">
                                                        {{ computeInitials(user.username) }}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div class="min-w-0 flex-1">
                                                    <p class="truncate text-sm">{{ user.username }}</p>
                                                    <p class="text-muted-foreground truncate text-xs">
                                                        {{ user.email }}
                                                    </p>
                                                </div>
                                                <Badge v-if="user.id === ownerId" variant="secondary">
                                                    {{ t("settings.instance.currentOwner") }}
                                                </Badge>
                                            </div>
                                        </ComboboxItem>
                                    </ComboboxGroup>
                                </ComboboxViewport>
                            </ComboboxList>
                        </Combobox>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <CardTitle>{{ t("settings.instance.about") }}</CardTitle>
                            <CardDescription>{{ t("settings.instance.versionsDescription") }}</CardDescription>
                        </div>
                        <Button
                            :aria-label="t('settings.instance.copyVersions')"
                            :title="t('settings.instance.copyVersions')"
                            size="icon"
                            variant="ghost"
                            @click="copyVersions">
                            <Icon class="size-4" name="iconoir:copy" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div class="border-border/60 rounded-lg border p-3">
                            <dt class="text-muted-foreground text-xs">{{ t("settings.instance.web") }}</dt>
                            <dd class="mt-1 font-mono text-sm">{{ frontendVersion }}</dd>
                        </div>
                        <div class="border-border/60 rounded-lg border p-3">
                            <dt class="text-muted-foreground text-xs">{{ t("settings.instance.server") }}</dt>
                            <dd class="mt-1 font-mono text-sm">{{ backendVersion }}</dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>
        </div>

        <AlertDialog v-model:open="ownerChangeDialogOpen">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{{ t("settings.instance.changeOwnerTitle") }}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {{ t("settings.instance.changeOwnerDescription") }}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div v-if="pendingOwner" class="border-border/60 flex items-center gap-3 rounded-lg border p-3">
                    <Avatar class="size-10 shrink-0">
                        <AvatarFallback class="text-xs font-semibold">
                            {{ computeInitials(pendingOwner.username) }}
                        </AvatarFallback>
                    </Avatar>
                    <div class="min-w-0">
                        <p class="truncate text-sm font-medium">{{ pendingOwner.username }}</p>
                        <p class="text-muted-foreground truncate text-xs">{{ pendingOwner.email }}</p>
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel @click="cancelOwnerChange">{{ t("common.cancel") }}</AlertDialogCancel>
                    <AlertDialogAction :disabled="savingOwner" @click="confirmOwnerChange">
                        <span v-if="!savingOwner">{{ t("common.save") }}</span>
                        <span v-else>{{ t("common.saving") }}</span>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
</template>
