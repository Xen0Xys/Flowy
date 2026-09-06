import {computed, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter} from "vue";
import {useReferenceStore, type TransactionCategory, type TransactionMerchant} from "~/stores/reference.store";
import {useUserStore} from "~/stores/user.store";
import type {Account} from "~/stores/account.store";

type ScopedReferences = {
    categories: TransactionCategory[];
    merchants: TransactionMerchant[];
};

export type OwnerReferenceGroup = {
    ownerId: string;
    ownerUsername: string;
    isCurrentUser: boolean;
    categories: TransactionCategory[];
    merchants: TransactionMerchant[];
};

const scopeCache = new Map<string, Promise<ScopedReferences>>();

async function fetchScopedReferences(accountId: string): Promise<ScopedReferences> {
    const existing = scopeCache.get(accountId);
    if (existing) return existing;

    const referenceStore = useReferenceStore();
    const promise = Promise.all([
        referenceStore.fetchCategoriesForAccount(accountId),
        referenceStore.fetchMerchantsForAccount(accountId),
    ]).then(([categories, merchants]) => ({categories, merchants}));

    scopeCache.set(accountId, promise);
    try {
        return await promise;
    } catch (err) {
        scopeCache.delete(accountId);
        throw err;
    }
}

export function invalidateAccountScopedReferences(accountId?: string) {
    if (accountId) scopeCache.delete(accountId);
    else scopeCache.clear();
}

export function useAccountScopedReferences(accountIdSource: MaybeRefOrGetter<string | null | undefined>) {
    const referenceStore = useReferenceStore();
    const scoped = ref<ScopedReferences | null>(null);
    const isLoading = ref(false);

    watch(
        () => toValue(accountIdSource),
        async (accountId) => {
            if (!accountId) {
                scoped.value = null;
                return;
            }
            isLoading.value = true;
            try {
                scoped.value = await fetchScopedReferences(accountId);
            } catch {
                scoped.value = null;
            } finally {
                isLoading.value = false;
            }
        },
        {immediate: true},
    );

    const categories: ComputedRef<TransactionCategory[]> = computed(
        () => scoped.value?.categories ?? referenceStore.categories,
    );
    const merchants: ComputedRef<TransactionMerchant[]> = computed(
        () => scoped.value?.merchants ?? referenceStore.merchants,
    );

    return {categories, merchants, isLoading};
}

export function useAccountsGroupedReferences(accountsSource: MaybeRefOrGetter<Account[]>) {
    const userStore = useUserStore();
    const groupsState = ref<OwnerReferenceGroup[]>([]);
    const isLoading = ref(false);

    watch(
        () => {
            const accounts = toValue(accountsSource);
            const seen = new Map<string, {ownerUsername: string; accountId: string}>();
            for (const account of accounts) {
                if (seen.has(account.ownerId)) continue;
                seen.set(account.ownerId, {ownerUsername: account.ownerUsername, accountId: account.id});
            }
            return Array.from(seen.entries()).map(([ownerId, meta]) => ({
                ownerId,
                ownerUsername: meta.ownerUsername,
                accountId: meta.accountId,
            }));
        },
        async (owners) => {
            if (owners.length === 0) {
                groupsState.value = [];
                return;
            }
            isLoading.value = true;
            try {
                const results = await Promise.all(
                    owners.map(async (owner) => {
                        const refs = await fetchScopedReferences(owner.accountId);
                        return {
                            ownerId: owner.ownerId,
                            ownerUsername: owner.ownerUsername,
                            isCurrentUser: owner.ownerId === userStore.user?.id,
                            categories: refs.categories,
                            merchants: refs.merchants,
                        } satisfies OwnerReferenceGroup;
                    }),
                );
                results.sort((a, b) => {
                    if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
                    return a.ownerUsername.localeCompare(b.ownerUsername);
                });
                groupsState.value = results;
            } catch {
                groupsState.value = [];
            } finally {
                isLoading.value = false;
            }
        },
        {immediate: true, deep: true},
    );

    const groups: ComputedRef<OwnerReferenceGroup[]> = computed(() => groupsState.value);

    return {groups, isLoading};
}
