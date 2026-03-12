<script lang="ts" setup>
import {onMounted, ref} from "vue";
import {useUserStore} from "~/stores/user.store";
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

const userStore = useUserStore();

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
    if (!ownerId.value) return;
    savingOwner.value = true;
    try {
        await userStore.updateInstanceOwner(ownerId.value);
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
                <p class="text-muted-foreground text-sm">
                    Manage global instance settings
                </p>
            </div>

            <Card>
                <div class="flex flex-col gap-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Registration</div>
                            <div class="text-muted-foreground text-xs">
                                Allow users to register
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch
                                v-model="registrationEnabled"
                                aria-label="Registration enabled" />
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        :disabled="savingRegistration"
                                        size="sm"
                                        >Save</Button
                                    >
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle
                                            >Save registration
                                            setting</AlertDialogTitle
                                        >
                                        <AlertDialogDescription>
                                            Changing registration setting
                                            affects who can create accounts. Are
                                            you sure?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel
                                            >Cancel</AlertDialogCancel
                                        >
                                        <AlertDialogAction
                                            @click="saveRegistration"
                                            >Save</AlertDialogAction
                                        >
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>

                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">
                                Instance owner
                            </div>
                            <div class="text-muted-foreground text-xs">
                                Set the owner of this instance (user id)
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Input v-model="ownerId" placeholder="owner id" />
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button :disabled="savingOwner" size="sm"
                                        >Save</Button
                                    >
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle
                                            >Change instance
                                            owner</AlertDialogTitle
                                        >
                                        <AlertDialogDescription>
                                            Changing the instance owner
                                            transfers administrative control.
                                            This is destructive. Proceed?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel
                                            >Cancel</AlertDialogCancel
                                        >
                                        <AlertDialogAction @click="saveOwner"
                                            >Save</AlertDialogAction
                                        >
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
