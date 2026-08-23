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
    css: ["@/assets/css/main.css", "vue-sonner/style.css"],
    app: {
        pageTransition: {name: "page", mode: "out-in"},
    },
    vite: {
        plugins: [
            // @ts-ignore
            tailwindcss(),
        ],
        optimizeDeps: {
            include: [
                "@internationalized/date",
                "@lucide/vue",
                "@tanstack/vue-table",
                "@unovis/ts",
                "@unovis/vue",
                "@vueuse/core",
                "class-variance-authority",
                "clsx",
                "d3-shape",
                "lucide-vue-next",
                "reka-ui",
                "reka-ui/date",
                "tailwind-merge",
                "vee-validate",
                "vue-sonner",
            ],
        },
    },
    modules: [
        "@nuxt/icon",
        "@nuxt/fonts",
        "@nuxtjs/color-mode",
        "@nuxtjs/i18n",
        "shadcn-nuxt",
        "@pinia/nuxt",
        "nuxt-security",
    ],
    fonts: {
        families: [
            {name: "Geist", provider: "google", weights: [400, 500, 600, 700], styles: ["normal"]},
            {name: "Bricolage Grotesque", provider: "google", weights: [500, 600, 700, 800], styles: ["normal"]},
        ],
        defaults: {
            weights: [400, 500, 600, 700],
            styles: ["normal"],
            subsets: ["latin", "latin-ext"],
        },
    },
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
    icon: {
        serverBundle: {
            collections: ["iconoir", "svg-spinners"],
        },
        clientBundle: {
            scan: {
                globInclude: ["**/*.{vue,jsx,tsx,ts,js,md,mdc,mdx}"],
            },
            sizeLimitKb: 512,
        },
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
