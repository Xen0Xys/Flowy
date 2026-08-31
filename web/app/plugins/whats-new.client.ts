import {watch} from "vue";
import {useWhatsNew} from "~/composables/useWhatsNew";
import {useAuthStore} from "~/stores/auth.store";
import {useUserStore} from "~/stores/user.store";

export default defineNuxtPlugin(() => {
    const authStore = useAuthStore();
    const userStore = useUserStore();
    const {check} = useWhatsNew();

    let triggered = false;
    const trigger = () => {
        if (triggered) return;
        if (!authStore.isAuthenticated || !userStore.user?.id) return;
        triggered = true;
        void check();
    };

    trigger();
    watch(
        () => [authStore.isAuthenticated, userStore.user?.id] as const,
        () => trigger(),
    );
});
