import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useAuthStore} from "~/stores/auth.store";
import {i18nT} from "~/utils/i18n";

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
                    toast.info(i18nT("user.store.info.sessionExpired"));
                }
                const message = err?.message ?? i18nT("user.store.errors.fetchProfile");
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
                toast.success(i18nT("user.store.success.usernameUpdated"));
                return updatedUser;
            } catch (err: any) {
                const message = err?.message ?? i18nT("user.store.errors.updateUsername");
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
                toast.success(i18nT("user.store.success.emailUpdated"));
                return updatedUser;
            } catch (err: any) {
                const message = err?.message ?? i18nT("user.store.errors.updateEmail");
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
                toast.success(i18nT("user.store.success.passwordUpdated"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("user.store.errors.updatePassword");
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
                const message = err?.message ?? i18nT("user.store.errors.listUsers");
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
                const message = err?.message ?? i18nT("user.store.errors.fetchInstanceSettings");
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
                toast.success(i18nT("user.store.success.registrationUpdated"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("user.store.errors.updateRegistration");
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
                toast.success(i18nT("user.store.success.instanceOwnerUpdated"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("user.store.errors.updateInstanceOwner");
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
                toast.success(i18nT("user.store.success.userDeleted"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("user.store.errors.deleteUser");
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
                toast.success(i18nT("user.store.success.passwordUpdated"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("user.store.errors.updatePassword");
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
