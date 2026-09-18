import {useUserStore} from "~/stores/user.store";

export default defineNuxtRouteMiddleware(async () => {
    const userStore = useUserStore();
    try {
        const isOwner = await userStore.fetchIsInstanceOwner();
        if (!isOwner) return navigateTo("/");
    } catch {
        return navigateTo("/");
    }
});
