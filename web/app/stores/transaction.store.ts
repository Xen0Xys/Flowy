import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";
import {i18nT} from "~/utils/i18n";

const i18nT = (key: string, params?: Record<string, unknown>) => {
    const i18n = useNuxtApp().$i18n;
    return (params ? (i18n?.t(key, params) as string | undefined) : (i18n?.t(key) as string | undefined)) ?? key;
};

export type TransactionMerchant = {
    id: string;
    userId: string;
    name: string;
    createdAt?: string;
    updatedAt?: string;
};

export type TransactionCategory = {
    id: string;
    userId: string;
    name: string;
    hexColor: string;
    icon: string;
    createdAt?: string;
    updatedAt?: string;
};

export type Transaction = {
    id: string;
    accountId: string;
    amount: number;
    description: string;
    date: string;
    merchant?: TransactionMerchant;
    category?: TransactionCategory;
    isRebalance: boolean;
    createdAt?: string;
    updatedAt?: string;
};

export type CreateTransactionPayload = {
    amount: number;
    description: string;
    date: string;
    merchantId?: string;
    categoryId?: string;
    isRebalance?: boolean;
};

export type UpdateTransactionPayload = {
    amount?: number;
    description?: string;
    date?: string;
    merchantId?: string | null;
    categoryId?: string | null;
    isRebalance?: boolean;
};

export const useTransactionStore = defineStore("transaction", {
    state: () => ({
        transactions: [] as Transaction[],
        currentAccountTransactions: [] as Transaction[],
    }),

    actions: {
        async fetchTransactions() {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const transactions = await apiFetch<Transaction[]>("/transaction");
                this.transactions = transactions;
                return transactions;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.fetchTransactions");
                toast.error(message);
                throw new Error(message);
            }
        },

        async fetchTransactionsByAccountId(accountId: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const transactions = await apiFetch<Transaction[]>(`/transaction/${accountId}`);
                this.currentAccountTransactions = transactions;
                return transactions;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.fetchAccountTransactions");
                toast.error(message);
                throw new Error(message);
            }
        },

        async createTransaction(accountId: string, payload: CreateTransactionPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const newTransaction = await apiFetch<Transaction>(`/transaction/${accountId}`, {
                    method: "POST",
                    body: payload,
                });

                this.transactions = [newTransaction, ...this.transactions];
                if (newTransaction.accountId === accountId) {
                    this.currentAccountTransactions = [newTransaction, ...this.currentAccountTransactions];
                }

                toast.success(i18nT("transaction.store.success.transactionCreated"));
                return newTransaction;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.createTransaction");
                toast.error(message);
                throw new Error(message);
            }
        },

        async updateTransaction(transactionId: string, payload: UpdateTransactionPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const updatedTransaction = await apiFetch<Transaction>(`/transaction/${transactionId}`, {
                    method: "PATCH",
                    body: payload,
                });

                this.transactions = this.transactions.map((transaction) =>
                    transaction.id === transactionId ? updatedTransaction : transaction,
                );
                this.currentAccountTransactions = this.currentAccountTransactions.map((transaction) =>
                    transaction.id === transactionId ? updatedTransaction : transaction,
                );

                toast.success(i18nT("transaction.store.success.transactionUpdated"));
                return updatedTransaction;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.updateTransaction");
                toast.error(message);
                throw new Error(message);
            }
        },

        async deleteTransaction(transactionId: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                await apiFetch(`/transaction/${transactionId}`, {
                    method: "DELETE",
                });

                this.transactions = this.transactions.filter((transaction) => transaction.id !== transactionId);
                this.currentAccountTransactions = this.currentAccountTransactions.filter(
                    (transaction) => transaction.id !== transactionId,
                );

                toast.success(i18nT("transaction.store.success.transactionDeleted"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.deleteTransaction");
                toast.error(message);
                throw new Error(message);
            }
        },

        clearCurrentAccountTransactions() {
            this.currentAccountTransactions = [];
        },
    },
});
