import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {type User, useUserStore} from "~/stores/user.store";
import {i18nT} from "~/utils/i18n";

const i18nT = (key: string, params?: Record<string, unknown>) => {
    const i18n = useNuxtApp().$i18n;
    return (params ? (i18n?.t(key, params) as string | undefined) : (i18n?.t(key) as string | undefined)) ?? key;
};

export type Family = {
    name: string;
    currency: string;
    owner: User;
    members?: User[];
};

export const useFamilyStore = defineStore("family", {
    state: () => ({
        family: null as Family | null,
    }),

    actions: {
        async fetchFamily() {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const family = await apiFetch<Family>("/family/family");
                this.family = family;
                return family;
            } catch (err: any) {
                const message = err?.message ?? i18nT("family.store.errors.fetchFamily");
                toast.error(message);
                throw new Error(message);
            }
        },

        async createFamily(payload: {name: string; currency: string}) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const family = await apiFetch<any>("/family/create", {
                    method: "POST",
                    body: payload,
                });
                // server updates user's family; refresh profile to keep store in sync
                await userStore.fetchProfile();
                toast.success(i18nT("family.store.success.familyCreated"));
                return family;
            } catch (err: any) {
                const message = err?.message ?? i18nT("family.store.errors.createFamily");
                toast.error(message);
                throw new Error(message);
            }
        },

        async inviteMember(email: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const data = await apiFetch<any>("/family/invite", {
                    method: "POST",
                    body: {email},
                });
                toast.success(i18nT("family.store.success.inviteCreated"));
                return data;
            } catch (err: any) {
                const message = err?.message ?? i18nT("family.store.errors.createInvite");
                toast.error(message);
                throw new Error(message);
            }
        },

        async getInvites() {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                return await apiFetch<any[]>("/family/invites");
            } catch (err: any) {
                const message = err?.message ?? i18nT("family.store.errors.fetchInvites");
                toast.error(message);
                throw new Error(message);
            }
        },

        async revokeInvite(code: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                await apiFetch(`/family/invites/${code}`, {
                    method: "DELETE",
                });
                toast.success(i18nT("family.store.success.inviteRevoked"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("family.store.errors.revokeInvite");
                toast.error(message);
                throw new Error(message);
            }
        },

        async joinFamily(code: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                await apiFetch(`/family/join/${code}`, {
                    method: "POST",
                });
                // server changed user's family; refresh profile
                await userStore.fetchProfile();
                toast.success(i18nT("family.store.success.joinedFamily"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("family.store.errors.joinFamily");
                toast.error(message);
                throw new Error(message);
            }
        },

        async quitFamily() {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                await apiFetch("/family/quit", {method: "DELETE"});
                // server removed user's family; refresh profile
                await userStore.fetchProfile();
                toast.success(i18nT("family.store.success.leftFamily"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("family.store.errors.leaveFamily");
                toast.error(message);
                throw new Error(message);
            }
        },

        async updateFamilySettings(body: {name?: string; currency?: string}) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const family = await apiFetch<any>("/family/settings", {
                    method: "PATCH",
                    body,
                });
                if (this.family) {
                    if (body.name) this.family.name = body.name;
                    if (body.currency) this.family.currency = body.currency;
                }
                toast.success(i18nT("family.store.success.familyUpdated"));
                return family;
            } catch (err: any) {
                const message = err?.message ?? i18nT("family.store.errors.updateFamily");
                toast.error(message);
                throw new Error(message);
            }
        },

        async removeFamilyMember(memberId: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                // Expecting backend to implement: DELETE /family/members/:id
                await apiFetch(`/family/members/${memberId}`, {
                    method: "DELETE",
                });
                // refresh profile and return success
                await userStore.fetchProfile();
                toast.success(i18nT("family.store.success.memberRemoved"));
                return true;
            } catch (err: any) {
                // If endpoint missing, give a helpful message
                if (err?.status === 404 || err?.response?.status === 404) {
                    const msg = i18nT("family.store.errors.removeMemberEndpointMissing");
                    toast.error(msg);
                    throw new Error(msg);
                }
                const message = err?.message ?? i18nT("family.store.errors.removeMember");
                toast.error(message);
                throw new Error(message);
            }
        },

        async deleteFamily() {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                // Expecting backend to implement: DELETE /family
                await apiFetch(`/family`, {method: "DELETE"});
                // After deletion, clear user's family info by refreshing profile
                await userStore.fetchProfile();
                toast.success(i18nT("family.store.success.familyDeleted"));
                return true;
            } catch (err: any) {
                if (err?.status === 404 || err?.response?.status === 404) {
                    const msg = i18nT("family.store.errors.deleteFamilyEndpointMissing");
                    toast.error(msg);
                    throw new Error(msg);
                }
                const message = err?.message ?? i18nT("family.store.errors.deleteFamily");
                toast.error(message);
                throw new Error(message);
            }
        },

        async adminGetFamily(familyId: string): Promise<Family> {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                return await apiFetch<Family>(`/admin/family/${familyId}`);
            } catch (err: any) {
                const message = err?.message ?? i18nT("family.store.errors.fetchFamily");
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
