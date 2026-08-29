<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {cn} from "@/lib/utils";

type Variant = "expense" | "income" | "neutral";

const props = withDefaults(
    defineProps<{
        modelValue: number;
        currency?: string;
        locale?: string;
        variant?: Variant;
        disabled?: boolean;
        id?: string;
        required?: boolean;
        placeholder?: string;
        class?: string;
    }>(),
    {
        currency: "USD",
        locale: undefined,
        variant: "neutral",
        disabled: false,
        placeholder: "0.00",
    },
);

const emit = defineEmits<{
    (e: "update:modelValue", value: number): void;
}>();

const inputEl = ref<HTMLInputElement | null>(null);
const isFocused = ref(false);
const rawText = ref("");

const resolvedLocale = computed(() => {
    if (props.locale) return props.locale;
    if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
    return "en-US";
});

const currencySymbol = computed(() => {
    try {
        const parts = new Intl.NumberFormat(resolvedLocale.value, {
            style: "currency",
            currency: props.currency,
            currencyDisplay: "narrowSymbol",
        }).formatToParts(0);
        return parts.find((p) => p.type === "currency")?.value ?? props.currency;
    } catch {
        return props.currency;
    }
});

const decimalSeparator = computed(() => {
    try {
        const parts = new Intl.NumberFormat(resolvedLocale.value).formatToParts(1.1);
        return parts.find((p) => p.type === "decimal")?.value ?? ".";
    } catch {
        return ".";
    }
});

const groupSeparator = computed(() => {
    try {
        const parts = new Intl.NumberFormat(resolvedLocale.value).formatToParts(1000);
        return parts.find((p) => p.type === "group")?.value ?? ",";
    } catch {
        return ",";
    }
});

const formatDisplay = (value: number): string => {
    if (!Number.isFinite(value) || value === 0) return "";
    try {
        return new Intl.NumberFormat(resolvedLocale.value, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        return value.toFixed(2);
    }
};

const parseInput = (text: string): number => {
    if (!text) return 0;
    let normalized = text.replace(new RegExp(`\\${groupSeparator.value}`, "g"), "");
    if (decimalSeparator.value !== ".") {
        normalized = normalized.replace(decimalSeparator.value, ".");
    }
    normalized = normalized.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

watch(
    () => props.modelValue,
    (value) => {
        if (isFocused.value) return;
        rawText.value = formatDisplay(value);
    },
    {immediate: true},
);

const onInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    const decSep = decimalSeparator.value;
    const filtered = value.replace(new RegExp(`[^0-9\\${decSep}]`, "g"), "");
    const firstDecIdx = filtered.indexOf(decSep);
    let cleaned = filtered;
    if (firstDecIdx !== -1) {
        cleaned =
            filtered.slice(0, firstDecIdx + 1) +
            filtered.slice(firstDecIdx + 1).replace(new RegExp(`\\${decSep}`, "g"), "");
        const [intPart, decPart = ""] = cleaned.split(decSep);
        cleaned = intPart + decSep + decPart.slice(0, 2);
    }
    rawText.value = cleaned;
    emit("update:modelValue", parseInput(cleaned));
};

const onFocus = () => {
    isFocused.value = true;
    const value = props.modelValue;
    if (!Number.isFinite(value) || value === 0) {
        rawText.value = "";
    } else {
        rawText.value = value.toString().replace(".", decimalSeparator.value);
    }
};

const onBlur = () => {
    isFocused.value = false;
    rawText.value = formatDisplay(props.modelValue);
};

const variantClasses = computed(() => {
    switch (props.variant) {
        case "expense":
            return {
                text: "text-destructive",
                border: "focus-within:ring-destructive/40 focus-within:border-destructive",
                symbolColor: "text-destructive",
                sign: "-",
            };
        case "income":
            return {
                text: "text-success",
                border: "focus-within:ring-success/40 focus-within:border-success",
                symbolColor: "text-success",
                sign: "+",
            };
        default:
            return {
                text: "text-foreground",
                border: "focus-within:ring-ring/40 focus-within:border-ring",
                symbolColor: "text-muted-foreground",
                sign: "",
            };
    }
});

const focus = () => inputEl.value?.focus();
defineExpose({focus});
</script>

<template>
    <div
        :class="
            cn(
                'bg-background flex h-16 w-full items-center gap-2 rounded-lg border px-4 shadow-xs transition-all focus-within:ring-4',
                variantClasses.border,
                disabled && 'cursor-not-allowed opacity-60',
                props.class,
            )
        ">
        <div :class="cn('flex items-baseline gap-1 text-2xl font-semibold', variantClasses.symbolColor)">
            <span v-if="variantClasses.sign" aria-hidden="true">{{ variantClasses.sign }}</span>
            <span aria-hidden="true">{{ currencySymbol }}</span>
        </div>
        <input
            :id="id"
            ref="inputEl"
            :value="rawText"
            :placeholder="placeholder"
            :required="required"
            :disabled="disabled"
            inputmode="decimal"
            autocomplete="off"
            style="outline: none; box-shadow: none"
            :class="
                cn(
                    'placeholder:text-muted-foreground/50 w-full flex-1 border-0 bg-transparent text-right text-2xl font-semibold tabular-nums',
                    '!shadow-none !ring-0 !outline-none focus:!shadow-none focus:!ring-0 focus:!outline-none focus-visible:!shadow-none focus-visible:!ring-0 focus-visible:!outline-none',
                    variantClasses.text,
                )
            "
            @input="onInput"
            @focus="onFocus"
            @blur="onBlur" />
    </div>
</template>
