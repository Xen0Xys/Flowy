import {useAuthStore} from "~/stores/auth.store";

export default defineNuxtPlugin(() => {
    // Pinia is registered by @pinia/nuxt module; it's safe to use stores here.
    const store = useAuthStore();
    store.loadFromStorage();
});
