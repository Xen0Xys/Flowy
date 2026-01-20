import {useUserStore} from "~/stores/user.store";

export default defineNuxtRouteMiddleware(async (to) => {
    const publicPaths = ["/auth/login", "/auth/register"];

    // allow public routes and internal Nuxt paths
    if (publicPaths.includes(to.path) || to.path.startsWith("/_")) return;

    const store = useUserStore();

    try {
        store.loadFromStorage();
    } catch {
        // ignore
    }

    if (!store.isAuthenticated) {
        return navigateTo("/auth/login");
    }

    try {
        if (!store.getUser) {
            await store.fetchProfile();
        }
    } catch {
        return navigateTo("/auth/login");
    }

    if (!store.hasFamily) {
        if (!to.path.startsWith("/onboarding")) {
            return navigateTo("/onboarding/select");
        }
    }
});
