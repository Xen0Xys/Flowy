import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {type User, useUserStore} from "~/stores/user.store";

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
                const message = err?.message ?? "Failed fetching family";
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
                toast.success("Family created");
                return family;
            } catch (err: any) {
                const message = err?.message ?? "Failed creating family";
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
                toast.success("Invite created");
                return data;
            } catch (err: any) {
                const message = err?.message ?? "Failed creating invite";
                toast.error(message);
                throw new Error(message);
            }
        },

        async getInvites() {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const invites = await apiFetch<any[]>("/family/invites");
                return invites;
            } catch (err: any) {
                const message = err?.message ?? "Failed fetching invites";
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
                toast.success("Invite revoked");
            } catch (err: any) {
                const message = err?.message ?? "Failed revoking invite";
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
                toast.success("Joined family");
            } catch (err: any) {
                const message = err?.message ?? "Failed joining family";
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
                toast.success("Left family");
            } catch (err: any) {
                const message = err?.message ?? "Failed leaving family";
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
                toast.success("Family updated");
                return family;
            } catch (err: any) {
                const message = err?.message ?? "Failed updating family";
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
                toast.success("Member removed");
                return true;
            } catch (err: any) {
                // If endpoint missing, give a helpful message
                if (err?.status === 404 || err?.response?.status === 404) {
                    const msg = "Remove member endpoint not found on server";
                    toast.error(msg);
                    throw new Error(msg);
                }
                const message = err?.message ?? "Failed removing member";
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
                toast.success("Family deleted");
                return true;
            } catch (err: any) {
                if (err?.status === 404 || err?.response?.status === 404) {
                    const msg = "Delete family endpoint not found on server";
                    toast.error(msg);
                    throw new Error(msg);
                }
                const message = err?.message ?? "Failed deleting family";
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
                const message = err?.message ?? "Failed fetching family";
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
