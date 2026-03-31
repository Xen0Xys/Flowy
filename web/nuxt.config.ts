// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json";

let securityHeaders = {};
if (process.env.NODE_ENV === "production") {
    securityHeaders = {
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
    };
}

export default defineNuxtConfig({
    runtimeConfig: {
        public: {
            apiBase: process.env.NUXT_PUBLIC_API_BASE || "",
            appVersion: pkg.version,
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
    modules: ["@nuxt/icon", "@nuxtjs/color-mode", "@nuxtjs/i18n", "shadcn-nuxt", "@pinia/nuxt", "nuxt-security"],
    i18n: {
        strategy: "no_prefix",
        defaultLocale: "en",
        langDir: "locales",
        locales: [
            {
                code: "en",
                name: "English",
                file: "en.json",
            },
            {
                code: "fr",
                name: "Français",
                file: "fr.json",
            },
        ],
        detectBrowserLanguage: {
            useCookie: true,
            cookieKey: "i18n_redirected",
            alwaysRedirect: true,
            fallbackLocale: "en",
        },
    },
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
    security: securityHeaders,
});
