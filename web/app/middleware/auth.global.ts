import {useAuthStore} from "~/stores/auth.store";
import {useUserStore} from "~/stores/user.store";

export default defineNuxtRouteMiddleware(async (to) => {
    const publicPaths = ["/auth/login", "/auth/register"];

    // allow public routes and internal Nuxt paths
    if (publicPaths.includes(to.path) || to.path.startsWith("/_")) return;

    const authStore = useAuthStore();
    const userStore = useUserStore();

    try {
        authStore.loadFromStorage();
    } catch {
        // ignore
    }

    if (!authStore.isAuthenticated) {
        return navigateTo("/auth/login");
    }

    try {
        if (!userStore.getUser) {
            await userStore.fetchProfile();
        }
    } catch {
        return navigateTo("/auth/login");
    }

    if (!userStore.hasFamily) {
        if (!to.path.startsWith("/onboarding")) {
            return navigateTo("/onboarding/select");
        }
    }
});
