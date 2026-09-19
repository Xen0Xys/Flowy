import {watch} from "vue";
import {useUpdateAvailable} from "~/composables/useUpdateAvailable";
import {useAuthStore} from "~/stores/auth.store";
import {useUserStore} from "~/stores/user.store";

const MIN_INTERVAL_MS = 60 * 1000;

export default defineNuxtPlugin(() => {
    const authStore = useAuthStore();
    const userStore = useUserStore();
    const {check} = useUpdateAvailable();

    let lastCallAt = 0;
    const runCheck = () => {
        if (!authStore.isAuthenticated || !userStore.user?.id) return;
        if (Date.now() - lastCallAt < MIN_INTERVAL_MS) return;
        lastCallAt = Date.now();
        void check();
    };

    runCheck();

    watch(
        () => [authStore.isAuthenticated, userStore.user?.id] as const,
        () => runCheck(),
    );

    if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") runCheck();
        });
    }
});
