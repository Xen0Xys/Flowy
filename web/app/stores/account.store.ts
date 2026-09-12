import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";
import {i18nT} from "~/utils/i18n";

export type AccountAccess = "owner" | "write" | "read";

export type Account = {
    id: string;
    name: string;
    type: string;
    balance: number;
    ownerId: string;
    ownerUsername: string;
    access: AccountAccess;
    sharesCount: number;
    createdAt?: string;
    updatedAt?: string;
};

export type CreateAccountPayload = {
    name: string;
    type: string;
    balance: number;
};

export type UpdateAccountPayload = {
    name?: string;
    type?: string;
    balance?: number;
};

export type AccountBalanceEvolutionPoint = {
    date: string;
    balance: number;
};

export type AccountSharePermission = "READ" | "WRITE";

export type AccountShare = {
    id: string;
    accountId: string;
    sharedWithId: string;
    sharedWithUsername: string;
    sharedWithEmail: string;
    permission: AccountSharePermission;
    createdAt: string;
    updatedAt: string;
};

export const useAccountStore = defineStore("account", {
    state: () => ({
        accounts: [] as Account[],
        currentAccount: null as Account | null,
        currentAccountEvolution: [] as AccountBalanceEvolutionPoint[],
        // Turns true once the first fetchAccounts settles; consumers use it to
        // distinguish "no writable accounts" from "still loading" and avoid
        // hiding CTAs during the initial network round-trip.
        hasFetched: false,
    }),

    getters: {
        writableAccounts(state): Account[] {
            return state.accounts.filter((a) => a.access === "owner" || a.access === "write");
        },
        ownedAccounts(state): Account[] {
            return state.accounts.filter((a) => a.access === "owner");
        },
        sharedAccounts(state): Account[] {
            return state.accounts.filter((a) => a.access !== "owner");
        },
        canWriteAccount(state) {
            return (accountId?: string | null): boolean => {
                if (!accountId) return false;
                const account = state.accounts.find((a) => a.id === accountId);
                if (!account) return false;
                return account.access === "owner" || account.access === "write";
            };
        },
    },

    actions: {
        async fetchAccounts() {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const accounts = await apiFetch<Account[]>("/account");
                this.accounts = accounts;
                this.hasFetched = true;
                return accounts;
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("account.store.errors.fetchAccounts");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async fetchAccountById(id: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const account = await apiFetch<Account>(`/account/${id}`);
                this.currentAccount = account;
                return account;
            } catch (err: any) {
                const message = err?.message ?? i18nT("account.store.errors.fetchAccount");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async createAccount(payload: CreateAccountPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const newAccount = await apiFetch<Account>("/account", {
                    method: "POST",
                    body: payload,
                });
                this.accounts.push(newAccount);
                toast.success(i18nT("account.store.success.accountCreated"));
                return newAccount;
            } catch (err: any) {
                const message = err?.message ?? i18nT("account.store.errors.createAccount");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async deleteAccount(id: string, currentPassword: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                await apiFetch(`/account/${id}`, {
                    method: "DELETE",
                    body: {currentPassword},
                });
                this.accounts = this.accounts.filter((acc) => acc.id !== id);
                if (this.currentAccount?.id === id) {
                    this.currentAccount = null;
                }
                toast.success(i18nT("account.store.success.accountDeleted"));
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("account.store.errors.deleteAccount");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async updateAccount(id: string, payload: UpdateAccountPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const updated = await apiFetch<Account>(`/account/${id}`, {
                    method: "PATCH",
                    body: payload,
                });

                this.accounts = this.accounts.map((account) => (account.id === id ? updated : account));

                if (this.currentAccount?.id === id) {
                    this.currentAccount = updated;
                }

                toast.success(i18nT("account.store.success.accountUpdated"));
                return updated;
            } catch (err: any) {
                const message = err?.message ?? i18nT("account.store.errors.updateAccount");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async fetchAccountBalanceEvolution(id: string, startDate: string, endDate: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const evolution = await apiFetch<AccountBalanceEvolutionPoint[]>(
                    `/account/${id}/evolution?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
                );

                this.currentAccountEvolution = evolution;
                return evolution;
            } catch (err: any) {
                const message = err?.message ?? i18nT("account.store.errors.fetchEvolution");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async fetchShares(accountId: string): Promise<AccountShare[]> {
            const {apiFetch} = useApi();
            try {
                return await apiFetch<AccountShare[]>(`/account/${accountId}/shares`);
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("account.share.toast.fetchError");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async shareAccount(
            accountId: string,
            memberId: string,
            permission: AccountSharePermission,
        ): Promise<AccountShare> {
            const {apiFetch} = useApi();
            try {
                const share = await apiFetch<AccountShare>(`/account/${accountId}/shares`, {
                    method: "POST",
                    body: {memberId, permission},
                });
                toast.success(i18nT("account.share.toast.shared"));
                return share;
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("account.share.toast.shareError");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async updateShare(
            accountId: string,
            memberId: string,
            permission: AccountSharePermission,
        ): Promise<AccountShare> {
            const {apiFetch} = useApi();
            try {
                const share = await apiFetch<AccountShare>(`/account/${accountId}/shares/${memberId}`, {
                    method: "PATCH",
                    body: {permission},
                });
                toast.success(i18nT("account.share.toast.updated"));
                return share;
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("account.share.toast.updateError");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async revokeShare(accountId: string, memberId: string): Promise<void> {
            const {apiFetch} = useApi();
            try {
                await apiFetch(`/account/${accountId}/shares/${memberId}`, {method: "DELETE"});
                toast.success(i18nT("account.share.toast.revoked"));
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("account.share.toast.revokeError");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },
    },
});
