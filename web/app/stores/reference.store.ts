import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";
import type {TransactionCategory, TransactionMerchant} from "~/stores/transaction.store";

type CreateCategoryPayload = {
    name: string;
    hexColor: string;
    icon: string;
};

type UpdateCategoryPayload = {
    name?: string;
    hexColor?: string;
    icon?: string;
};

type CreateMerchantPayload = {
    name: string;
};

type UpdateMerchantPayload = {
    name?: string;
};

export const useReferenceStore = defineStore("reference", {
    state: () => ({
        categories: [] as TransactionCategory[],
        merchants: [] as TransactionMerchant[],
        isLoading: false,
        isLoaded: false,
    }),

    actions: {
        async fetchReferences() {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");

            if (this.isLoaded) return;

            const {apiFetch} = useApi();
            this.isLoading = true;

            try {
                const [cats, merchs] = await Promise.all([
                    apiFetch<TransactionCategory[]>("/reference/categories"),
                    apiFetch<TransactionMerchant[]>("/reference/merchants"),
                ]);

                this.categories = cats;
                this.merchants = merchs;
                this.isLoaded = true;
            } catch (err: any) {
                const message = err?.message ?? "Failed fetching references";
                toast.error(message);
                throw new Error(message);
            } finally {
                this.isLoading = false;
            }
        },

        async refetchReferences() {
            this.isLoaded = false;
            await this.fetchReferences();
        },

        async createCategory(payload: CreateCategoryPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");

            const {apiFetch} = useApi();

            try {
                const newCategory = await apiFetch<TransactionCategory>("/reference/category", {
                    method: "POST",
                    body: payload,
                });

                this.categories = [newCategory, ...this.categories];
                toast.success("Category created");
                return newCategory;
            } catch (err: any) {
                const message = err?.message ?? "Failed creating category";
                toast.error(message);
                throw new Error(message);
            }
        },

        async updateCategory(categoryId: string, payload: UpdateCategoryPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");

            const {apiFetch} = useApi();

            try {
                const updatedCategory = await apiFetch<TransactionCategory>(`/reference/category/${categoryId}`, {
                    method: "PATCH",
                    body: payload,
                });

                this.categories = this.categories.map((category) =>
                    category.id === categoryId ? updatedCategory : category,
                );
                toast.success("Category updated");
                return updatedCategory;
            } catch (err: any) {
                const message = err?.message ?? "Failed updating category";
                toast.error(message);
                throw new Error(message);
            }
        },

        async deleteCategory(categoryId: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");

            const {apiFetch} = useApi();

            try {
                await apiFetch(`/reference/category/${categoryId}`, {
                    method: "DELETE",
                });

                this.categories = this.categories.filter((category) => category.id !== categoryId);
                toast.success("Category deleted");
            } catch (err: any) {
                const message = err?.message ?? "Failed deleting category";
                toast.error(message);
                throw new Error(message);
            }
        },

        async createMerchant(payload: CreateMerchantPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");

            const {apiFetch} = useApi();

            try {
                const newMerchant = await apiFetch<TransactionMerchant>("/reference/merchant", {
                    method: "POST",
                    body: payload,
                });

                this.merchants = [newMerchant, ...this.merchants];
                toast.success("Merchant created");
                return newMerchant;
            } catch (err: any) {
                const message = err?.message ?? "Failed creating merchant";
                toast.error(message);
                throw new Error(message);
            }
        },

        async updateMerchant(merchantId: string, payload: UpdateMerchantPayload) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");

            const {apiFetch} = useApi();

            try {
                const updatedMerchant = await apiFetch<TransactionMerchant>(`/reference/merchant/${merchantId}`, {
                    method: "PATCH",
                    body: payload,
                });

                this.merchants = this.merchants.map((merchant) =>
                    merchant.id === merchantId ? updatedMerchant : merchant,
                );
                toast.success("Merchant updated");
                return updatedMerchant;
            } catch (err: any) {
                const message = err?.message ?? "Failed updating merchant";
                toast.error(message);
                throw new Error(message);
            }
        },

        async deleteMerchant(merchantId: string) {
            const userStore = useUserStore();
            if (!userStore.token) throw new Error("No token available");

            const {apiFetch} = useApi();

            try {
                await apiFetch(`/reference/merchant/${merchantId}`, {
                    method: "DELETE",
                });

                this.merchants = this.merchants.filter((merchant) => merchant.id !== merchantId);
                toast.success("Merchant deleted");
            } catch (err: any) {
                const message = err?.message ?? "Failed deleting merchant";
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
