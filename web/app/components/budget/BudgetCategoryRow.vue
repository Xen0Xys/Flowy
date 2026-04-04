<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {toCurrency} from "~/lib/currency";

const {t} = useI18n();

const props = defineProps<{
    id?: string;
    name: string;
    icon: string;
    hexColor: string;
    budgeted: number;
    spent: number;
    currency: string;
}>();

const remaining = computed(() => Math.max(0, props.budgeted - props.spent));
const absoluteRemaining = computed(() => props.budgeted - props.spent);
const isOverBudget = computed(() => props.spent > props.budgeted);

const percentage = computed(() => {
    if (props.budgeted === 0) return props.spent > 0 ? 100 : 0;
    return Math.round((props.spent / props.budgeted) * 100);
});

const progressColor = computed(() => (isOverBudget.value ? "#ef4444" : props.hexColor));

const formatCurrency = (value: number) => {
    return toCurrency(value, props.currency);
};
</script>

<template>
    <div class="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3 transition-colors">
        <!-- Icon with donut ring -->
        <div class="relative flex h-11 w-11 shrink-0 items-center justify-center">
            <svg class="h-11 w-11" viewBox="0 0 44 44">
                <circle class="stroke-muted" cx="22" cy="22" fill="none" r="18" stroke-width="4" />
                <circle
                    :stroke="progressColor"
                    :stroke-dasharray="2 * 3.14159 * 18"
                    :stroke-dashoffset="2 * 3.14159 * 18 * (1 - Math.min(spent / (budgeted || 1), 1))"
                    class="transition-all duration-500"
                    cx="22"
                    cy="22"
                    fill="none"
                    r="18"
                    stroke-linecap="round"
                    stroke-width="4"
                    transform="rotate(-90 22 22)" />
            </svg>
            <Icon :name="icon" :style="{color: hexColor}" class="absolute h-4 w-4" />
        </div>

        <!-- Info -->
        <div class="min-w-0 flex-1">
            <!-- Top row: name + spent -->
            <div class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-medium">{{ name }}</span>
                <span
                    :class="isOverBudget ? 'text-destructive' : 'text-foreground'"
                    class="shrink-0 text-sm font-semibold tabular-nums">
                    {{ formatCurrency(spent) }} ({{ percentage }}%)
                </span>
            </div>
            <!-- Bottom row: remaining left | bar + percentage + spent/budgeted right -->
            <div class="mt-0.5 flex items-center justify-between gap-3">
                <span v-if="absoluteRemaining >= 0" class="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {{ formatCurrency(Math.abs(absoluteRemaining)) }} {{ t("budget.category.left") }}
                </span>
                <span v-else class="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {{ formatCurrency(Math.abs(absoluteRemaining)) }} {{ t("budget.category.over") }}
                </span>
                <div class="flex items-center gap-2">
                    <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {{ formatCurrency(spent) }}
                    </span>
                    <div class="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
                        <div
                            :style="{
                                width: `${Math.min(percentage, 100)}%`,
                                backgroundColor: progressColor,
                            }"
                            class="h-full rounded-full transition-all duration-500" />
                    </div>
                    <span class="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
                        {{ formatCurrency(budgeted) }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>
