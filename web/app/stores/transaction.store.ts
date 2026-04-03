import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";
import {i18nT} from "~/utils/i18n";

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
    linkedTransactionId?: string;
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

export type DeleteTransactionOptions = {
    keepLinkedTransaction?: boolean;
};

export type CreateTransferPayload = {
    debitAccountId: string;
    creditAccountId: string;
    description: string;
    date: string;
    amount: number;
};

export type BulkTransactionsTestResult = {
    wouldInsertCount: number;
    duplicates: CreateTransactionPayload[];
};

export type BulkTransactionsCreateResult = {
    insertedCount: number;
    duplicates: CreateTransactionPayload[];
};

export type TransactionSearchFilters = {
    search?: string;
    type?: "all" | "income" | "expense";
    accountId?: string | "all";
    categoryId?: string | "all";
    merchantId?: string | "all";
    rebalance?: "all" | "only" | "exclude";
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
};

export type SearchTransactionsResult = {
    items: Transaction[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    isPaginated: boolean;
};

export const useTransactionStore = defineStore("transaction", {
    state: () => ({}),

    actions: {
        async fetchTransactions() {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                return await apiFetch<Transaction[]>("/transaction");
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
                const params = new URLSearchParams({accountId});
                const endpoint = `/transaction?${params.toString()}`;
                const result = await apiFetch<SearchTransactionsResult>(endpoint);

                return result.items;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.fetchAccountTransactions");
                toast.error(message);
                throw new Error(message);
            }
        },

        async fetchTransactionById(transactionId: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                return await apiFetch<Transaction>(`/transaction/${transactionId}`);
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.fetchTransactions");
                toast.error(message);
                throw new Error(message);
            }
        },

        async searchTransactions(filters: TransactionSearchFilters = {}) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            const params = new URLSearchParams();

            if (filters.search?.trim()) {
                params.set("search", filters.search.trim());
            }

            if (filters.type && filters.type !== "all") {
                params.set("type", filters.type);
            }

            if (filters.accountId && filters.accountId !== "all") {
                params.set("accountId", filters.accountId);
            }

            if (filters.categoryId && filters.categoryId !== "all") {
                params.set("categoryId", filters.categoryId);
            }

            if (filters.merchantId && filters.merchantId !== "all") {
                params.set("merchantId", filters.merchantId);
            }

            if (filters.rebalance && filters.rebalance !== "all") {
                params.set("rebalance", filters.rebalance);
            }

            if (filters.startDate) {
                params.set("startDate", filters.startDate);
            }

            if (filters.endDate) {
                params.set("endDate", filters.endDate);
            }

            if (filters.page !== undefined) {
                params.set("page", String(filters.page));
            }

            if (filters.pageSize !== undefined) {
                params.set("pageSize", String(filters.pageSize));
            }

            const queryString = params.toString();
            const endpoint = queryString ? `/transaction?${queryString}` : "/transaction";

            try {
                return await apiFetch<SearchTransactionsResult>(endpoint);
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.fetchTransactions");
                toast.error(message);
                throw new Error(message);
            }
        },

        async createTransaction(accountId: string, payload: CreateTransactionPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const newTransaction = await apiFetch<Transaction>(`/transaction/account/${accountId}`, {
                    method: "POST",
                    body: payload,
                });

                toast.success(i18nT("transaction.store.success.transactionCreated"));
                return newTransaction;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.createTransaction");
                toast.error(message);
                throw new Error(message);
            }
        },

        async testBulkTransactions(accountId: string, payload: CreateTransactionPayload[]) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                return await apiFetch<BulkTransactionsTestResult>(`/transaction/account/${accountId}/bulk/test`, {
                    method: "POST",
                    body: payload,
                });
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.testBulkTransactions");
                toast.error(message);
                throw new Error(message);
            }
        },

        async createBulkTransactions(accountId: string, payload: CreateTransactionPayload[]) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const result = await apiFetch<BulkTransactionsCreateResult>(`/transaction/account/${accountId}/bulk`, {
                    method: "POST",
                    body: payload,
                });

                await Promise.all([this.fetchTransactions(), this.fetchTransactionsByAccountId(accountId)]);

                toast.success(i18nT("transaction.store.success.bulkTransactionsCreated", {count: result.insertedCount}));
                return result;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.createBulkTransactions");
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

                toast.success(i18nT("transaction.store.success.transactionUpdated"));
                return updatedTransaction;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.updateTransaction");
                toast.error(message);
                throw new Error(message);
            }
        },

        async deleteTransaction(transactionId: string, options: DeleteTransactionOptions = {}) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            const params = new URLSearchParams();

            if (typeof options.keepLinkedTransaction === "boolean") {
                params.set("keepLinkedTransaction", String(options.keepLinkedTransaction));
            }

            const queryString = params.toString();
            const endpoint = queryString
                ? `/transaction/${transactionId}?${queryString}`
                : `/transaction/${transactionId}`;

            try {
                await apiFetch(endpoint, {
                    method: "DELETE",
                });

                toast.success(i18nT("transaction.store.success.transactionDeleted"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.deleteTransaction");
                toast.error(message);
                throw new Error(message);
            }
        },

        async createTransfer(payload: CreateTransferPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const transactions = await apiFetch<Transaction[]>("/transfer", {
                    method: "POST",
                    body: payload,
                });

                toast.success(i18nT("transaction.store.success.transferCreated"));
                return transactions;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.createTransfer");
                toast.error(message);
                throw new Error(message);
            }
        },

        async unlinkTransfer(transactionId: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const transactions = await apiFetch<Transaction[]>(`/transfer/unlink/${transactionId}`, {
                    method: "DELETE",
                });

                toast.success(i18nT("transaction.store.success.transferUnlinked"));
                return transactions;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.unlinkTransfer");
                toast.error(message);
                throw new Error(message);
            }
        },

        async linkTransactions(transactionId1: string, transactionId2: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const transactions = await apiFetch<Transaction[]>(
                    `/transfer/link/${transactionId1}/${transactionId2}`,
                    {
                        method: "POST",
                    },
                );

                toast.success(i18nT("transaction.store.success.transferLinked"));
                return transactions;
            } catch (err: any) {
                const message = err?.message ?? i18nT("transaction.store.errors.linkTransactions");
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
