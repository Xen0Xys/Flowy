import {computed, ref, watch, type ComputedRef, type Ref, type WritableComputedRef} from "vue";
import {watchDebounced} from "@vueuse/core";
import type {TransactionCategory, TransactionMerchant} from "~/stores/transaction.store";
import {useReferenceMatcher} from "~/composables/useReferenceMatcher";

type StringSource = Ref<string> | WritableComputedRef<string>;

type Options = {
    description: StringSource;
    categoryId: StringSource;
    merchantId: StringSource;
    categories: ComputedRef<TransactionCategory[]>;
    merchants: ComputedRef<TransactionMerchant[]>;
    enabled?: ComputedRef<boolean>;
    debounceMs?: number;
};

export function useDescriptionReferenceAutoFill(options: Options) {
    const {matchDescription, primaryKeywordFor} = useReferenceMatcher();
    const lastAutoFilledDescription = ref<string | null>(null);
    const isEnabled = () => options.enabled?.value ?? true;

    const canAutoFillDescription = () =>
        options.description.value === "" || options.description.value === lastAutoFilledDescription.value;

    const composedAutoDescription = computed(() => {
        if (!isEnabled()) return "";
        const merchant =
            options.merchantId.value && options.merchantId.value !== "none"
                ? options.merchants.value.find((m) => m.id === options.merchantId.value)
                : null;
        const category =
            options.categoryId.value && options.categoryId.value !== "none"
                ? options.categories.value.find((c) => c.id === options.categoryId.value)
                : null;
        const parts: string[] = [];
        if (category?.autoCompleteEnabled) parts.push(primaryKeywordFor(category));
        if (merchant?.autoCompleteEnabled) parts.push(primaryKeywordFor(merchant));
        return parts.filter((part) => part.length > 0).join(" ");
    });

    watchDebounced(
        () => options.description.value,
        (description) => {
            if (!isEnabled()) return;
            if (!description || !description.trim()) return;
            const match = matchDescription(description, options.categories.value, options.merchants.value);
            if (match.categoryId && options.categoryId.value === "none") {
                options.categoryId.value = match.categoryId;
            }
            if (match.merchantId && options.merchantId.value === "none") {
                options.merchantId.value = match.merchantId;
            }
        },
        {debounce: options.debounceMs ?? 300},
    );

    watch(composedAutoDescription, (auto) => {
        if (!isEnabled()) return;
        if (!canAutoFillDescription()) return;
        options.description.value = auto;
        lastAutoFilledDescription.value = auto || null;
    });

    const reset = () => {
        lastAutoFilledDescription.value = null;
    };

    return {reset};
}
