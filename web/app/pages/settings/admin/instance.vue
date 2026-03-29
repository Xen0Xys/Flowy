<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
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

const {copy} = useClipboard();

const copyVersions = async () => {
    const text = `Web: ${frontendVersion.value}\nServer: ${backendVersion.value}`;
    await copy(text);
    toast.success("Versions copied to clipboard");
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
            backendVersion.value = "unknown";
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
        toast.error("Owner ID is required.");
        return;
    }

    if (!isValidUuidV7(nextOwnerId)) {
        toast.error("Owner ID must be a valid UUID v7.");
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
        <div class="mx-auto w-full max-w-4xl py-6">
            <div class="mb-6">
                <h1 class="text-2xl font-semibold">Instance settings</h1>
                <p class="text-muted-foreground text-sm">Manage global instance settings</p>
            </div>

            <Card>
                <div class="flex flex-col gap-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Versions</div>
                            <div class="text-muted-foreground text-xs">Current version of the frontend and backend</div>
                        </div>
                        <div class="flex items-center gap-4 text-sm">
                            <div class="flex flex-col items-end gap-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-muted-foreground text-xs">Web</span>
                                    <span class="bg-muted rounded-md px-2 py-0.5 font-mono text-xs">{{
                                        frontendVersion
                                    }}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-muted-foreground text-xs">Server</span>
                                    <span class="bg-muted rounded-md px-2 py-0.5 font-mono text-xs">{{
                                        backendVersion
                                    }}</span>
                                </div>
                            </div>
                            <Button size="icon" variant="ghost" @click="copyVersions" title="Copy versions">
                                <Icon name="iconoir:copy" class="size-4" />
                            </Button>
                        </div>
                    </div>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Registration</div>
                            <div class="text-muted-foreground text-xs">Allow users to register</div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch v-model="registrationEnabled" aria-label="Registration enabled" />
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button :disabled="savingRegistration" size="sm">Save</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Save registration setting</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Changing registration setting affects who can create accounts. Are you sure?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction @click="saveRegistration">Save</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>

                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Instance owner</div>
                            <div class="text-muted-foreground text-xs">Set the owner of this instance (user id)</div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Input v-model="ownerId" placeholder="owner id" />
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button :disabled="savingOwner" size="sm">Save</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Change instance owner</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Changing the instance owner transfers administrative control. This is
                                            destructive. Proceed?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction @click="saveOwner">Save</AlertDialogAction>
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
