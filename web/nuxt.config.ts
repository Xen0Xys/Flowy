// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
    runtimeConfig: {
        public: {
            apiBase: process.env.NUXT_PUBLIC_API_BASE || "",
        },
    },
    compatibilityDate: "2025-07-15",
    devtools: {enabled: true},
    css: ["@/assets/css/main.css"],
    vite: {
        plugins: [
            // @ts-ignore
            tailwindcss(),
        ],
    },
    modules: ["@nuxt/icon", "@nuxtjs/color-mode", "shadcn-nuxt", "@pinia/nuxt"],
    // Make dark theme the default
    colorMode: {
        preference: "dark",
        classSuffix: "",
    },
    shadcn: {
        prefix: "",
        componentDir: "@/components/ui",
    },
});
