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
    access: AccountAccess;
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
    }),

    getters: {
        writableAccounts(state): Account[] {
            return state.accounts.filter((a) => a.access === "owner" || a.access === "write");
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
                return accounts;
            } catch (err: any) {
                const message = err?.message ?? i18nT("account.store.errors.fetchAccounts");
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

        async deleteAccount(id: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                await apiFetch(`/account/${id}`, {
                    method: "DELETE",
                });
                this.accounts = this.accounts.filter((acc) => acc.id !== id);
                if (this.currentAccount?.id === id) {
                    this.currentAccount = null;
                }
                toast.success(i18nT("account.store.success.accountDeleted"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("account.store.errors.deleteAccount");
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
                const message = err?.message ?? "Failed to fetch shares";
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
                toast.success("Account shared");
                return share;
            } catch (err: any) {
                const message = err?.message ?? "Failed to share account";
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
                toast.success("Share updated");
                return share;
            } catch (err: any) {
                const message = err?.message ?? "Failed to update share";
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async revokeShare(accountId: string, memberId: string): Promise<void> {
            const {apiFetch} = useApi();
            try {
                await apiFetch(`/account/${accountId}/shares/${memberId}`, {method: "DELETE"});
                toast.success("Share revoked");
            } catch (err: any) {
                const message = err?.message ?? "Failed to revoke share";
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },
    },
});
