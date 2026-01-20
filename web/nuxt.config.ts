// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    runtimeConfig: {
        public: {
            apiBase: process.env.NUXT_PUBLIC_API_BASE || "",
        },
    },
    compatibilityDate: "2025-07-15",
    devtools: {enabled: true},
    modules: ["@nuxt/icon", "@nuxtjs/tailwindcss", "shadcn-nuxt", "@pinia/nuxt"],
    shadcn: {
        prefix: "",
        componentDir: "@/components/ui",
    },
});