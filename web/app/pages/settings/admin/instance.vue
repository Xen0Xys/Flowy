<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {useUserStore} from "~/stores/user.store";
import {useApi} from "~/composables/useApi";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {isValidUuidV7} from "@/lib/validation";
import {toast} from "vue-sonner";
import {useClipboard} from "@vueuse/core";

const userStore = useUserStore();
const {apiFetch} = useApi();
const config = useRuntimeConfig();

const frontendVersion = computed(() => config.public.appVersion as string);
const backendVersion = ref("...");
const {t} = useI18n();

const {copy} = useClipboard();

const copyVersions = async () => {
    const text = `Web: ${frontendVersion.value}\nServer: ${backendVersion.value}`;
    await copy(text);
    toast.success(t("settings.instance.toasts.versionsCopied"));
};

const loading = ref(false);
const settings = ref<any>(null);
const ownerId = ref("");
const registrationEnabled = ref(true);
const savingRegistration = ref(false);
const savingOwner = ref(false);

async function load() {
    if (!userStore.token) return;
    loading.value = true;
    try {
        const s = await userStore.getInstanceSettings();
        settings.value = s;
        ownerId.value = s?.instanceOwner ?? "";
        registrationEnabled.value = !!s?.registrationEnabled;

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

onMounted(() => {
    load();
});

async function saveRegistration() {
    savingRegistration.value = true;
    try {
        await userStore.updateRegistrationEnabled(registrationEnabled.value);
    } finally {
        savingRegistration.value = false;
    }
}

async function saveOwner() {
    const nextOwnerId = ownerId.value.trim();
    if (!nextOwnerId) {
        toast.error(t("settings.instance.errors.ownerRequired"));
        return;
    }

    if (!isValidUuidV7(nextOwnerId)) {
        toast.error(t("settings.instance.errors.ownerInvalid"));
        return;
    }

    savingOwner.value = true;
    try {
        ownerId.value = nextOwnerId;
        await userStore.updateInstanceOwner(nextOwnerId);
    } finally {
        savingOwner.value = false;
    }
}
</script>

<template>
    <div class="w-full">
        <div class="mx-auto w-full max-w-6xl py-6">
            <div class="mb-6 flex items-center gap-3">
                <Icon class="icon-lg text-primary shrink-0" name="iconoir:server" />
                <div>
                    <h1 class="text-2xl font-semibold">{{ t("settings.instance.title") }}</h1>
                    <p class="text-muted-foreground text-sm">{{ t("settings.instance.subtitle") }}</p>
                </div>
            </div>

            <Card>
                <div class="flex flex-col gap-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">{{ t("settings.instance.versions") }}</div>
                            <div class="text-muted-foreground text-xs">
                                {{ t("settings.instance.versionsDescription") }}
                            </div>
                        </div>
                        <div class="flex items-center gap-4 text-sm">
                            <div class="flex flex-col items-end gap-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-muted-foreground text-xs">{{ t("settings.instance.web") }}</span>
                                    <span class="bg-muted rounded-md px-2 py-0.5 font-mono text-xs">{{
                                        frontendVersion
                                    }}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-muted-foreground text-xs">{{
                                        t("settings.instance.server")
                                    }}</span>
                                    <span class="bg-muted rounded-md px-2 py-0.5 font-mono text-xs">{{
                                        backendVersion
                                    }}</span>
                                </div>
                            </div>
                            <Button
                                :title="t('settings.instance.copyVersions')"
                                size="icon"
                                variant="ghost"
                                @click="copyVersions">
                                <Icon class="size-4" name="iconoir:copy" />
                            </Button>
                        </div>
                    </div>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">{{ t("settings.instance.registration") }}</div>
                            <div class="text-muted-foreground text-xs">
                                {{ t("settings.instance.registrationDescription") }}
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch
                                v-model="registrationEnabled"
                                :aria-label="t('settings.instance.registrationEnabled')" />
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button :disabled="savingRegistration" size="sm">{{ t("common.save") }}</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>{{
                                            t("settings.instance.saveRegistrationTitle")
                                        }}</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            {{ t("settings.instance.saveRegistrationDescription") }}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                                        <AlertDialogAction @click="saveRegistration">{{
                                            t("common.save")
                                        }}</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>

                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">{{ t("settings.instance.owner") }}</div>
                            <div class="text-muted-foreground text-xs">
                                {{ t("settings.instance.ownerDescription") }}
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Input v-model="ownerId" :placeholder="t('settings.instance.ownerPlaceholder')" />
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button :disabled="savingOwner" size="sm">{{ t("common.save") }}</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>{{
                                            t("settings.instance.changeOwnerTitle")
                                        }}</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            {{ t("settings.instance.changeOwnerDescription") }}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                                        <AlertDialogAction @click="saveOwner">{{ t("common.save") }}</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    </div>
</template>
