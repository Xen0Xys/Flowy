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
    // Rapid account switches can race; only the latest issued request may
    // commit its result to `scoped`.
    let latestRequestId = 0;

    watch(
        () => toValue(accountIdSource),
        async (accountId) => {
            const currentRequest = ++latestRequestId;
            if (!accountId) {
                scoped.value = null;
                return;
            }
            isLoading.value = true;
            try {
                const refs = await fetchScopedReferences(accountId);
                if (currentRequest !== latestRequestId) return;
                scoped.value = refs;
            } catch {
                if (currentRequest === latestRequestId) scoped.value = null;
            } finally {
                if (currentRequest === latestRequestId) isLoading.value = false;
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
    let latestRequestId = 0;

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
            const currentRequest = ++latestRequestId;
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
                if (currentRequest !== latestRequestId) return;
                results.sort((a, b) => {
                    if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
                    return a.ownerUsername.localeCompare(b.ownerUsername);
                });
                groupsState.value = results;
            } catch {
                if (currentRequest === latestRequestId) groupsState.value = [];
            } finally {
                if (currentRequest === latestRequestId) isLoading.value = false;
            }
        },
        {immediate: true},
    );

    const groups: ComputedRef<OwnerReferenceGroup[]> = computed(() => groupsState.value);

    return {groups, isLoading};
}
