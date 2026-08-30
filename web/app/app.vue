<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useHead, useRoute} from "#app";
import WhatsNewDialog from "~/components/whats-new/WhatsNewDialog.vue";

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
        {rel: "icon", type: "image/webp", href: "/flowy-logo.webp"},
        {rel: "icon", type: "image/png", sizes: "192x192", href: "/pwa-192x192.png"},
        {rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon-180x180.png"},
        {rel: "manifest", href: "/manifest.webmanifest"},
    ],
    meta: [
        {name: "robots", content: "noindex, nofollow"},
        {name: "theme-color", content: "#0b0b0f", media: "(prefers-color-scheme: dark)"},
        {name: "theme-color", content: "#3b6cff", media: "(prefers-color-scheme: light)"},
        {name: "mobile-web-app-capable", content: "yes"},
        {name: "apple-mobile-web-app-capable", content: "yes"},
        {name: "apple-mobile-web-app-title", content: "Flowy"},
        {name: "apple-mobile-web-app-status-bar-style", content: "black-translucent"},
        {property: "og:title", content: "Flowy"},
        {
            property: "og:description",
            content:
                "Flowy is a self-hosted finance platform built for people who are tired of juggling spreadsheets, disconnected banking apps, and shared Google Sheets that nobody agrees on.",
        },
        {property: "og:type", content: "website"},
        {property: "og:image", content: "/og-image.png"},
        {name: "twitter:card", content: "summary_large_image"},
    ],
});
</script>

<template>
    <div class="bg-background min-h-dvh">
        <NuxtLoadingIndicator />
        <Toaster close-button richColors />
        <ClientOnly>
            <WhatsNewDialog />
        </ClientOnly>
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>
    </div>
</template>
