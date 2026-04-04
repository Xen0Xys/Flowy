import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";
import {i18nT} from "~/utils/i18n";

export type BudgetedCategory = {
    budgetId: string;
    categoryId: string;
    amount: number;
    createdAt: string;
    updatedAt: string;
};

export type Budget = {
    id: string;
    userId: string;
    month: number;
    year: number;
    budgetedIncome: number;
    createdAt: string;
    updatedAt: string;
    budgetedCategories?: BudgetedCategory[];
};

export type BudgetSpendingCategory = {
    categoryId: string | null;
    name: string;
    hexColor: string;
    icon: string;
    spent: number;
};

export type BudgetSpending = {
    totalSpent: number;
    actualIncome: number;
    byCategory: BudgetSpendingCategory[];
};

export type AvailableMonth = {
    month: number;
    year: number;
};

export type CreateBudgetPayload = {
    month: number;
    year: number;
    budgetedIncome: number;
    categories: {categoryId: string; amount: number}[];
};

export type UpdateBudgetPayload = {
    month?: number;
    year?: number;
    budgetedIncome?: number;
    categories?: {categoryId: string; amount: number}[];
};

export const useBudgetStore = defineStore("budget", {
    state: () => ({
        currentBudget: null as Budget | null,
        isLoading: false,
    }),

    actions: {
        async getBudgetByPeriod(year: number, month: number): Promise<Budget | null> {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            this.isLoading = true;

            try {
                const budget = await apiFetch<Budget>(`/budget/${year}/${month}`);
                this.currentBudget = budget;
                return budget;
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.fetchBudget");
                toast.error(message);
                throw new Error(message);
            } finally {
                this.isLoading = false;
            }
        },

        async createBudget(payload: CreateBudgetPayload): Promise<Budget> {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const newBudget = await apiFetch<Budget>("/budget", {
                    method: "POST",
                    body: payload,
                });
                this.currentBudget = newBudget;
                toast.success(i18nT("budget.store.success.budgetCreated"));
                return newBudget;
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.createBudget");
                toast.error(message);
                throw new Error(message);
            }
        },

        async updateBudget(budgetId: string, payload: UpdateBudgetPayload): Promise<Budget> {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const updatedBudget = await apiFetch<Budget>(`/budget/${budgetId}`, {
                    method: "PUT",
                    body: payload,
                });
                this.currentBudget = updatedBudget;
                toast.success(i18nT("budget.store.success.budgetUpdated"));
                return updatedBudget;
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.updateBudget");
                toast.error(message);
                throw new Error(message);
            }
        },

        async deleteBudget(budgetId: string): Promise<void> {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                await apiFetch(`/budget/${budgetId}`, {
                    method: "DELETE",
                });
                this.currentBudget = null;
                toast.success(i18nT("budget.store.success.budgetDeleted"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.deleteBudget");
                toast.error(message);
                throw new Error(message);
            }
        },

        async getSpending(year: number, month: number): Promise<BudgetSpending> {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const spending = await apiFetch<BudgetSpending>(`/budget/${year}/${month}/spending`);
                return spending;
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.fetchSpending");
                toast.error(message);
                throw new Error(message);
            }
        },

        async getAvailableMonths(): Promise<AvailableMonth[]> {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const months = await apiFetch<AvailableMonth[]>("/budget/available-months");
                return months;
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.fetchAvailableMonths");
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
