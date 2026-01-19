import {useUserStore} from "~/stores/user.store";

export default defineNuxtPlugin(() => {
    // Pinia is registered by @pinia/nuxt module; it's safe to use stores here.
    const store = useUserStore();
    store.loadFromStorage();
});
