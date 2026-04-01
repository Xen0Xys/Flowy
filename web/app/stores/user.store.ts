import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useAuthStore} from "~/stores/auth.store";

export type User = {
    id: string;
    username: string;
    email: string;
    jwtId?: string;
    familyId?: string | null;
    familyRole?: string | null;
    [key: string]: any;
};

export const useUserStore = defineStore("user", {
    state: () => ({
        user: null as User | null,
    }),

    getters: {
        hasFamily: (state) => !!state.user?.familyId,
        getUser: (state) => state.user,
        token: () => useAuthStore().token,
        isAuthenticated: () => useAuthStore().isAuthenticated,
        getToken: () => useAuthStore().getToken,
        isFamilyAdmin: (state) => state.user?.familyRole === "ADMIN",
        isInstanceOwner: async () => {
            const {apiFetch} = useApi();
            try {
                await apiFetch("/admin/instance/settings");
                return true;
            } catch (err: any) {
                if (err?.status === 403 || err?.response?.status === 403) {
                    return false;
                }
                throw err;
            }
        },
    },

    actions: {
        async fetchProfile() {
            const authStore = useAuthStore();
            if (!authStore.token) throw new Error("No token available");

            const {apiFetch} = useApi();
            try {
                const user = await apiFetch<User>("/user/me");
                this.user = user;
                return user;
            } catch (err: any) {
                if (err?.status === 401 || err?.response?.status === 401) {
                    authStore.logout();
                    toast.info("Session expired. Please log in again.");
                }
                const message = err?.message ?? "Failed fetching profile";
                toast.error(message);
                throw new Error(message);
            }
        },

        async saveUsername(newUsername: string) {
            const authStore = useAuthStore();
            if (!authStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const updatedUser = await apiFetch<User>("/user/me/username", {
                    method: "PATCH",
                    body: {username: newUsername},
                });
                this.user = updatedUser;
                toast.success("Username updated");
                return updatedUser;
            } catch (err: any) {
                const message = err?.message ?? "Failed updating username";
                toast.error(message);
                throw new Error(message);
            }
        },

        async saveEmail(newEmail: string) {
            const authStore = useAuthStore();
            if (!authStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const updatedUser = await apiFetch<User>("/user/me/email", {
                    method: "PATCH",
                    body: {email: newEmail},
                });
                this.user = updatedUser;
                toast.success("Email updated");
                return updatedUser;
            } catch (err: any) {
                const message = err?.message ?? "Failed updating email";
                toast.error(message);
                throw new Error(message);
            }
        },

        async changePassword(currentPassword: string, newPassword: string) {
            const authStore = useAuthStore();
            if (!authStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                await apiFetch("/user/me/password", {
                    method: "PATCH",
                    body: {
                        currentPassword,
                        newPassword,
                    },
                });
                toast.success("Password updated");
            } catch (err: any) {
                const message = err?.message ?? "Failed updating password";
                toast.error(message);
                throw new Error(message);
            }
        },

        async listAdminUsers() {
            const authStore = useAuthStore();
            if (!authStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const users = await apiFetch<any[]>("/admin/users");
                return users;
            } catch (err: any) {
                const message = err?.message ?? "Failed listing users";
                toast.error(message);
                throw new Error(message);
            }
        },

        async getInstanceSettings() {
            const authStore = useAuthStore();
            if (!authStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                return await apiFetch<any>("/admin/instance/settings");
            } catch (err: any) {
                const message = err?.message ?? "Failed fetching instance settings";
                toast.error(message);
                throw new Error(message);
            }
        },

        async updateRegistrationEnabled(value: boolean) {
            const authStore = useAuthStore();
            if (!authStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                await apiFetch("/admin/instance/registration_enabled", {
                    method: "PATCH",
                    body: {registrationEnabled: value},
                });
                toast.success("Registration setting updated");
            } catch (err: any) {
                const message = err?.message ?? "Failed updating registration setting";
                toast.error(message);
                throw new Error(message);
            }
        },

        async updateInstanceOwner(newOwnerId: string) {
            const authStore = useAuthStore();
            if (!authStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                await apiFetch("/admin/instance/owner", {
                    method: "PATCH",
                    body: {ownerId: newOwnerId},
                });
                toast.success("Instance owner updated");
            } catch (err: any) {
                const message = err?.message ?? "Failed updating instance owner";
                toast.error(message);
                throw new Error(message);
            }
        },

        async adminDeleteUser(id: string) {
            const authStore = useAuthStore();
            if (!authStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                await apiFetch(`/admin/users/${id}`, {method: "DELETE"});
                toast.success("User deleted");
            } catch (err: any) {
                const message = err?.message ?? "Failed deleting user";
                toast.error(message);
                throw new Error(message);
            }
        },

        async adminUpdateUserPassword(id: string, password: string) {
            const authStore = useAuthStore();
            if (!authStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                await apiFetch(`/admin/users/${id}/password`, {
                    method: "PATCH",
                    body: {password},
                });
                toast.success("Password updated");
            } catch (err: any) {
                const message = err?.message ?? "Failed updating password";
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
