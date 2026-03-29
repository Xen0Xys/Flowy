import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";
import {i18nT} from "~/utils/i18n";

const i18nT = (key: string, params?: Record<string, unknown>) => {
    const i18n = useNuxtApp().$i18n;
    return (params ? (i18n?.t(key, params) as string | undefined) : (i18n?.t(key) as string | undefined)) ?? key;
};

export type Account = {
    id: string;
    name: string;
    type: string;
    balance: number;
    ownerId: string;
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

export const useAccountStore = defineStore("account", {
    state: () => ({
        accounts: [] as Account[],
        currentAccount: null as Account | null,
        currentAccountEvolution: [] as AccountBalanceEvolutionPoint[],
    }),

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
                throw new Error(message);
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
                throw new Error(message);
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
                throw new Error(message);
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
                throw new Error(message);
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
                throw new Error(message);
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
                throw new Error(message);
            }
        },
    },
});
