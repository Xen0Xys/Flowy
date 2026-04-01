import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";
import type {TransactionCategory, TransactionMerchant} from "~/stores/transaction.store";
import {i18nT} from "~/utils/i18n";

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
                const message = err?.message ?? i18nT("reference.store.errors.fetchReferences");
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
                toast.success(i18nT("reference.store.success.categoryCreated"));
                return newCategory;
            } catch (err: any) {
                const message = err?.message ?? i18nT("reference.store.errors.createCategory");
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
                toast.success(i18nT("reference.store.success.categoryUpdated"));
                return updatedCategory;
            } catch (err: any) {
                const message = err?.message ?? i18nT("reference.store.errors.updateCategory");
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
                toast.success(i18nT("reference.store.success.categoryDeleted"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("reference.store.errors.deleteCategory");
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
                toast.success(i18nT("reference.store.success.merchantCreated"));
                return newMerchant;
            } catch (err: any) {
                const message = err?.message ?? i18nT("reference.store.errors.createMerchant");
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
                toast.success(i18nT("reference.store.success.merchantUpdated"));
                return updatedMerchant;
            } catch (err: any) {
                const message = err?.message ?? i18nT("reference.store.errors.updateMerchant");
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
                toast.success(i18nT("reference.store.success.merchantDeleted"));
            } catch (err: any) {
                const message = err?.message ?? i18nT("reference.store.errors.deleteMerchant");
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
