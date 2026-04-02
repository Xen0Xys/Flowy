<script lang="ts" setup>
import "vue-sonner/style.css";
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useHead, useRoute} from "#app";

const route = useRoute();
const {t} = useI18n();

const pageTitle = computed(() => {
    const path = route.path || "/";

    if (path === "/") return t("app.pageTitle.dashboard");
    if (path.startsWith("/auth/login")) return t("app.pageTitle.login");
    if (path.startsWith("/auth/register")) return t("app.pageTitle.register");
    if (path.startsWith("/onboarding")) return t("app.pageTitle.onboarding");
    if (path.startsWith("/settings/admin/instance")) return t("app.pageTitle.instanceSettings");
    if (path.startsWith("/settings/admin/users")) return t("app.pageTitle.adminUsers");
    if (path.startsWith("/settings/user/profile")) return t("app.pageTitle.profile");
    if (path.startsWith("/settings/user/family")) return t("app.pageTitle.family");
    if (path.startsWith("/settings")) return t("app.pageTitle.settings");

    return "";
});

useHead({
    title: computed(() => (pageTitle.value ? t("app.head.withPage", {page: pageTitle.value}) : t("app.head.default"))),
    link: [
        {
            rel: "icon",
            type: "image/webp",
            href: "/flowy-logo.webp",
        },
    ],
    meta: [
        {
            name: "robots",
            content: "noindex, nofollow",
        },
    ],
});
</script>

<template>
    <div class="bg-background min-h-dvh">
        <NuxtLoadingIndicator />
        <Toaster close-button richColors />
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>
    </div>
</template>
