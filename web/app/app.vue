<script lang="ts" setup>
import "vue-sonner/style.css";
import {computed} from "vue";
import {useHead, useRoute} from "#app";

const route = useRoute();

const pageTitle = computed(() => {
    const path = route.path || "/";

    if (path === "/") return "Dashboard";
    if (path.startsWith("/auth/login")) return "Login";
    if (path.startsWith("/auth/register")) return "Register";
    if (path.startsWith("/onboarding")) return "Onboarding";
    if (path.startsWith("/settings/admin/instance")) {
        return "Instance Settings";
    }
    if (path.startsWith("/settings/admin/users")) return "Admin Users";
    if (path.startsWith("/settings/user/profile")) return "Profile";
    if (path.startsWith("/settings/user/family")) return "Family";
    if (path.startsWith("/settings")) return "Settings";

    return "";
});

useHead({
    title: computed(() =>
        pageTitle.value ? `Flowy - ${pageTitle.value}` : "Flowy",
    ),
});
</script>

<template>
    <div class="bg-background min-h-screen">
        <NuxtLoadingIndicator />
        <Toaster close-button richColors />
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>
    </div>
</template>
