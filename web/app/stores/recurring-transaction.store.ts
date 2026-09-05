import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";
import type {TransactionCategory, TransactionMerchant} from "~/stores/transaction.store";
import {i18nT} from "~/utils/i18n";

export type RecurrenceFrequency = "WEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "YEARLY";
export type RecurringExecutionStatus = "CREATED" | "SKIPPED" | "FAILED";

export type RecurringTransaction = {
    id: string;
    userId: string;
    accountId: string;
    name: string;
    amount: number;
    merchant?: TransactionMerchant;
    category?: TransactionCategory;
    frequency: RecurrenceFrequency;
    dayOfMonth: number | null;
    dayOfWeek: number | null;
    monthOfYear: number | null;
    timezone: string;
    inBudget: boolean;
    isEnabled: boolean;
    nextRunAt: string;
    lastRunAt: string | null;
    lastFailureAt: string | null;
    isFailing: boolean;
    createdAt: string;
    updatedAt: string;
};

export type RecurringTransactionExecution = {
    id: string;
    recurringTransactionId: string;
    transactionId: string | null;
    status: RecurringExecutionStatus;
    errorMessage: string | null;
    scheduledFor: string;
    executedAt: string;
};

export type ListExecutionsResult = {
    items: RecurringTransactionExecution[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export type CreateRecurringTransactionPayload = {
    name: string;
    amount: number;
    merchantId?: string;
    categoryId?: string;
    frequency: RecurrenceFrequency;
    dayOfMonth?: number;
    dayOfWeek?: number;
    monthOfYear?: number;
    timezone: string;
    inBudget: boolean;
    isEnabled?: boolean;
};

export type UpdateRecurringTransactionPayload = {
    name?: string;
    amount?: number;
    merchantId?: string | null;
    categoryId?: string | null;
    frequency?: RecurrenceFrequency;
    dayOfMonth?: number | null;
    dayOfWeek?: number | null;
    monthOfYear?: number | null;
    timezone?: string;
    inBudget?: boolean;
    isEnabled?: boolean;
};

export type RecurringCalendarOccurrence = {
    recurringTransactionId: string;
    scheduledFor: string;
    localDate: string;
};

export type RecurringCalendar = {
    year: number;
    month: number;
    occurrences: RecurringCalendarOccurrence[];
    recurringTransactions: RecurringTransaction[];
};

export const useRecurringTransactionStore = defineStore("recurring-transaction", {
    state: () => ({
        items: [] as RecurringTransaction[],
        isLoading: false,
    }),

    actions: {
        async fetchAll(filters: {accountId?: string; enabled?: boolean} = {}) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            const params = new URLSearchParams();
            if (filters.accountId) params.set("accountId", filters.accountId);
            if (typeof filters.enabled === "boolean") params.set("enabled", String(filters.enabled));
            const qs = params.toString();
            const endpoint = qs ? `/recurring-transaction?${qs}` : "/recurring-transaction";

            this.isLoading = true;
            try {
                const items = await apiFetch<RecurringTransaction[]>(endpoint);
                this.items = items;
                return items;
            } catch (err: any) {
                const message = err?.message ?? i18nT("recurring.store.errors.fetch");
                toast.error(message);
                throw new Error(message, {cause: err});
            } finally {
                this.isLoading = false;
            }
        },

        async fetchById(id: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                return await apiFetch<RecurringTransaction>(`/recurring-transaction/${id}`);
            } catch (err: any) {
                const message = err?.message ?? i18nT("recurring.store.errors.fetch");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async fetchCalendar(year: number, month: number) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                return await apiFetch<RecurringCalendar>(`/recurring-transaction/calendar?year=${year}&month=${month}`);
            } catch (err: any) {
                const message = err?.message ?? i18nT("recurring.store.errors.fetchCalendar");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async fetchExecutions(id: string, page = 1, pageSize = 20) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                return await apiFetch<ListExecutionsResult>(
                    `/recurring-transaction/${id}/executions?page=${page}&pageSize=${pageSize}`,
                );
            } catch (err: any) {
                const message = err?.message ?? i18nT("recurring.store.errors.fetchExecutions");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async create(accountId: string, payload: CreateRecurringTransactionPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const created = await apiFetch<RecurringTransaction>(`/recurring-transaction/account/${accountId}`, {
                    method: "POST",
                    body: payload,
                });
                this.items = [created, ...this.items];
                toast.success(i18nT("recurring.store.success.created"));
                return created;
            } catch (err: any) {
                const message = err?.message ?? i18nT("recurring.store.errors.create");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async update(id: string, payload: UpdateRecurringTransactionPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const updated = await apiFetch<RecurringTransaction>(`/recurring-transaction/${id}`, {
                    method: "PATCH",
                    body: payload,
                });
                this.items = this.items.map((rt) => (rt.id === id ? updated : rt));
                toast.success(i18nT("recurring.store.success.updated"));
                return updated;
            } catch (err: any) {
                const message = err?.message ?? i18nT("recurring.store.errors.update");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async toggle(id: string, isEnabled: boolean) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const updated = await apiFetch<RecurringTransaction>(`/recurring-transaction/${id}/toggle`, {
                    method: "PATCH",
                    body: {isEnabled},
                });
                this.items = this.items.map((rt) => (rt.id === id ? updated : rt));
                return updated;
            } catch (err: any) {
                const message = err?.message ?? i18nT("recurring.store.errors.update");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async remove(id: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                await apiFetch(`/recurring-transaction/${id}`, {method: "DELETE"});
                this.items = this.items.filter((rt) => rt.id !== id);
                toast.success(i18nT("recurring.store.success.deleted"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("recurring.store.errors.delete");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },
    },
});
