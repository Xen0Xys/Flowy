<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {toCurrency} from "~/lib/currency";
import {colorForIndex} from "~/utils/reports";
import type {MerchantBreakdown} from "~/stores/report.store";

const props = defineProps<{
    data: MerchantBreakdown[];
    currency: string;
}>();

const emit = defineEmits<{
    select: [string | null];
}>();

const {t} = useI18n();

function handleSelect(merchantId: string | null) {
    emit("select", merchantId);
}

const maxSpent = computed(() => Math.max(1, ...props.data.map((d) => d.spent)));

const items = computed(() =>
    props.data.map((m, idx) => ({
        ...m,
        label: m.merchantId ? m.name : t("reports.charts.topMerchants.unknown"),
        color: colorForIndex(idx),
        percentage: Math.round((m.spent / maxSpent.value) * 1000) / 10,
    })),
);

function formatCurrency(value: number) {
    return toCurrency(value, props.currency);
}
</script>

<template>
    <ul class="flex flex-col gap-2.5">
        <li v-for="(item, idx) in items" :key="`${item.merchantId ?? 'unknown'}-${idx}`">
            <button
                type="button"
                class="hover:bg-muted/60 group flex w-full flex-col rounded-md p-1 text-left transition-colors"
                @click="handleSelect(item.merchantId)">
                <div class="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span class="flex min-w-0 items-center gap-2">
                        <span class="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">{{ idx + 1 }}</span>
                        <span class="truncate font-medium">{{ item.label }}</span>
                    </span>
                    <span class="text-muted-foreground shrink-0 text-xs">
                        <span class="text-foreground font-semibold tabular-nums">{{ formatCurrency(item.spent) }}</span>
                        · {{ t("reports.charts.topMerchants.transactionsCount", {count: item.count}) }}
                    </span>
                </div>
                <div class="bg-muted h-2 w-full overflow-hidden rounded-full">
                    <div
                        class="h-full rounded-full transition-all duration-500 group-hover:brightness-110"
                        :style="{width: `${item.percentage}%`, backgroundColor: item.color}"></div>
                </div>
            </button>
        </li>
    </ul>
</template>
