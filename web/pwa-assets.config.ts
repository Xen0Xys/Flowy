import {defineConfig, minimal2023Preset} from "@vite-pwa/assets-generator/config";

export default defineConfig({
    headLinkOptions: {preset: "2023"},
    preset: {
        ...minimal2023Preset,
        transparent: {
            ...minimal2023Preset.transparent,
            favicons: [],
        },
    },
    images: ["public/flowy-logo.webp"],
});
