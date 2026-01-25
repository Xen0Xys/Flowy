<script setup lang="ts">
import {useUserStore} from "~/stores/user.store";
import {watch} from "vue";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

const userStore = useUserStore();

// Fetch lazily on client once token is available to avoid SSR/client mismatches
const {
    data: instanceSettings,
    pending: loading,
    error,
    execute: fetchInstanceSettings,
} = useLazyAsyncData(
    "instanceSettings",
    () => userStore.fetchInstanceSettings(),
    {server: false},
);

watch(
    () => userStore.token,
    (t) => {
        if (t) fetchInstanceSettings();
    },
    {immediate: true},
);

function toggleRegistration(e: Event) {
    const target = e.target as HTMLInputElement;
    userStore.updateRegistrationEnabled(target.checked);
}
</script>

<template>
    <Card class="max-w-2xl" innerClass="p-4">
        <header class="mb-4">
            <h2 class="text-lg font-semibold">Instance settings</h2>
            <p class="text-muted-foreground text-sm">
                Global settings for the instance
            </p>
        </header>

        <div v-if="loading">Loading...</div>
        <div v-else-if="!userStore.token">
            You are not authenticated. Please log in.
        </div>
        <div v-else>
            <div class="flex items-center justify-between gap-4">
                <div>
                    <p class="font-medium">Registration</p>
                    <p class="text-muted-foreground text-sm">
                        Allow new user signups
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <label class="inline-flex items-center gap-2">
                        <input
                            type="checkbox"
                            :checked="instanceSettings?.registrationEnabled"
                            @change="toggleRegistration"
                            aria-label="Enable registrations" />
                    </label>
                    <Button variant="ghost" @click="fetchInstanceSettings"
                        >Refresh</Button
                    >
                </div>
            </div>

            <div
                v-if="!instanceSettings"
                class="text-muted-foreground mt-3 text-sm">
                No data available
            </div>
            <div v-if="error" class="text-destructive mt-3 text-sm">
                Error while loading
            </div>
        </div>
    </Card>
</template>
