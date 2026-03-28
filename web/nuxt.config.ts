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
        optimizeDeps: {
            include: [
                "@vueuse/core",
                "vue-sonner",
                "lucide-vue-next",
                "clsx",
                "tailwind-merge",
                "vee-validate",
                "class-variance-authority",
                "reka-ui",
                "@unovis/vue",
                "@unovis/ts",
                "@tanstack/vue-table",
                "@internationalized/date",
            ],
        },
    },
    modules: ["@nuxt/icon", "@nuxtjs/color-mode", "shadcn-nuxt", "@pinia/nuxt", "nuxt-security"],
    // Make dark theme the default
    colorMode: {
        preference: "dark",
        classSuffix: "",
    },
    shadcn: {
        prefix: "",
        componentDir: "@/components/ui",
    },
    routeRules: {
        "/**": {
            headers: {
                "X-Frame-Options": "DENY",
                "X-Content-Type-Options": "nosniff",
                "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            },
        },
    },
    security: {
        headers: {
            contentSecurityPolicy: {
                "default-src": ["'self'"],
                "script-src": ["'self'", "'unsafe-inline'"],
                "style-src": ["'self'", "'unsafe-inline'"],
                "img-src": ["'self'", "data:", "https:"],
                "connect-src": ["'self'"],
                "font-src": ["'self'"],
                "object-src": ["'none'"],
                "media-src": ["'none'"],
                "frame-src": ["'none'"],
                "upgrade-insecure-requests": true,
            },

            crossOriginEmbedderPolicy: false,
            crossOriginOpenerPolicy: "same-origin",
            crossOriginResourcePolicy: false,

            referrerPolicy: "strict-origin-when-cross-origin",
        },
    },
});
