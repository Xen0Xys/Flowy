import {createPinia} from "pinia";
import type {NuxtApp} from "#app";
import {useUserStore} from "~/app/stores/user.store";

export default defineNuxtPlugin((nuxtApp: NuxtApp) => {
    // Ensure Pinia is registered before using stores. Nuxt may auto-install Pinia via a module,
    // but when this plugin runs early it can be missing (causing the getActivePinia() error).
    if (!(nuxtApp as any).$pinia) {
        const pinia = createPinia();
        nuxtApp.vueApp.use(pinia);
        // attach for future checks
        (nuxtApp as any).$pinia = pinia;
    }

    // Now it's safe to use the store
    const store = useUserStore();
    store.loadFromStorage();
});
