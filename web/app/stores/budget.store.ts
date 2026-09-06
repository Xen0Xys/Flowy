import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";
import {i18nT} from "~/utils/i18n";
import type {AccountAccess} from "~/stores/account.store";

export type BudgetedCategory = {
    budgetId: string;
    categoryId: string;
    amount: number;
    name: string;
    hexColor: string;
    icon: string;
    createdAt: string;
    updatedAt: string;
};

export type Budget = {
    id: string;
    userId: string;
    name: string | null;
    month: number;
    year: number;
    budgetedIncome: number;
    accountIds: string[];
    effectivePermission: AccountAccess;
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
    planned: number;
};

export type BudgetSpending = {
    totalSpent: number;
    totalPlanned: number;
    actualIncome: number;
    byCategory: BudgetSpendingCategory[];
    plannedByCategory: BudgetSpendingCategory[];
};

export type AvailableMonth = {
    month: number;
    year: number;
};

export type CreateBudgetPayload = {
    name?: string;
    month: number;
    year: number;
    budgetedIncome: number;
    categories: {categoryId: string; amount: number}[];
    accountIds: string[];
};

export type UpdateBudgetPayload = {
    name?: string | null;
    month?: number;
    year?: number;
    budgetedIncome?: number;
    categories?: {categoryId: string; amount: number}[];
    accountIds?: string[];
};

export const useBudgetStore = defineStore("budget", {
    state: () => ({
        budgets: [] as Budget[],
        currentBudget: null as Budget | null,
        currentSpending: null as BudgetSpending | null,
        isLoading: false,
    }),

    actions: {
        selectBudget(budgetId: string | null) {
            if (!budgetId) {
                this.currentBudget = null;
                this.currentSpending = null;
                return;
            }
            const match = this.budgets.find((b) => b.id === budgetId) ?? null;
            this.currentBudget = match;
            if (!match) this.currentSpending = null;
        },

        async getBudgetsByPeriod(year: number, month: number): Promise<Budget[]> {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            this.isLoading = true;

            try {
                const budgets = await apiFetch<Budget[]>(`/budget/${year}/${month}`);
                this.budgets = budgets;
                // Reconcile the current selection with the freshly fetched list.
                if (this.currentBudget) {
                    const still = budgets.find((b) => b.id === this.currentBudget!.id) ?? null;
                    this.currentBudget = still;
                    if (!still) this.currentSpending = null;
                }
                return budgets;
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.fetchBudget");
                toast.error(message);
                throw new Error(message, {cause: err});
            } finally {
                this.isLoading = false;
            }
        },

        async getBudgetById(budgetId: string): Promise<Budget> {
            const {apiFetch} = useApi();
            try {
                const budget = await apiFetch<Budget>(`/budget/${budgetId}`);
                this.currentBudget = budget;
                return budget;
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.fetchBudget");
                toast.error(message);
                throw new Error(message, {cause: err});
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
                this.budgets.push(newBudget);
                toast.success(i18nT("budget.store.success.budgetCreated"));
                return newBudget;
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.createBudget");
                toast.error(message);
                throw new Error(message, {cause: err});
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
                this.budgets = this.budgets.map((b) => (b.id === budgetId ? updatedBudget : b));
                if (this.currentBudget?.id === budgetId) this.currentBudget = updatedBudget;
                toast.success(i18nT("budget.store.success.budgetUpdated"));
                return updatedBudget;
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.updateBudget");
                toast.error(message);
                throw new Error(message, {cause: err});
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
                this.budgets = this.budgets.filter((b) => b.id !== budgetId);
                if (this.currentBudget?.id === budgetId) this.currentBudget = null;
                toast.success(i18nT("budget.store.success.budgetDeleted"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.deleteBudget");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async getSpending(budgetId: string): Promise<BudgetSpending> {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");
            const {apiFetch} = useApi();

            try {
                const spending = await apiFetch<BudgetSpending>(`/budget/${budgetId}/spending`);
                return spending;
            } catch (err: any) {
                const message = err?.message ?? i18nT("budget.store.errors.fetchSpending");
                toast.error(message);
                throw new Error(message, {cause: err});
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
                throw new Error(message, {cause: err});
            }
        },
    },
});
