import {useAuthStore} from "~/stores/auth.store";
import {useUserStore} from "~/stores/user.store";

export default defineNuxtRouteMiddleware(async (to) => {
    const publicPaths = ["/auth/login", "/auth/register", "/auth/mfa"];
    const isPublic = publicPaths.includes(to.path);

    const authStore = useAuthStore();
    try {
        authStore.loadFromStorage();
    } catch {
        // ignore
    }

    const userStore = useUserStore();

    if (isPublic) {
        // Bounce an already-authenticated user (with a loaded profile and no MFA
        // in flight) home so they cannot land back on /auth/* by bookmark or
        // back-button. Requiring a loaded profile prevents a stale token in the
        // cookie from ping-ponging the user between /auth/login and /.
        if (
            authStore.isAuthenticated &&
            !authStore.hasMfaChallenge &&
            userStore.getUser &&
            to.path.startsWith("/auth/")
        ) {
            return navigateTo("/");
        }
        return;
    }

    if (to.path.startsWith("/_")) return;

    if (!authStore.isAuthenticated) {
        return navigateTo("/auth/login");
    }

    try {
        if (!userStore.getUser) {
            await userStore.fetchProfile();
        }
    } catch {
        authStore.logout();
        return navigateTo("/auth/login");
    }

    if (!userStore.hasFamily) {
        if (!to.path.startsWith("/onboarding")) {
            return navigateTo("/onboarding");
        }
    }
});
