import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";

export type Account = {
    id: string;
    name: string;
    type: string;
    balance: number;
    userId: string;
    createdAt?: string;
    updatedAt?: string;
};

export type CreateAccountPayload = {
    name: string;
    type: string;
    balance: number;
};

export const useAccountStore = defineStore("account", {
    state: () => ({
        accounts: [] as Account[],
        currentAccount: null as Account | null,
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
                const message = err?.message ?? "Failed fetching accounts";
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
                const message = err?.message ?? "Failed fetching account";
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
                toast.success("Account created");
                return newAccount;
            } catch (err: any) {
                const message = err?.message ?? "Failed creating account";
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
                toast.success("Account deleted");
            } catch (err: any) {
                const message = err?.message ?? "Failed deleting account";
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
