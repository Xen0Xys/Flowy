<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {Skeleton} from "~/components/ui/skeleton";
import {toCurrency} from "~/lib/currency";
import {formatPercentDelta} from "~/utils/reports";
import type {ReportKpi} from "~/stores/report.store";

const props = defineProps<{
    data: ReportKpi | null;
    currency: string;
    loading?: boolean;
}>();

const {t} = useI18n();

const cards = computed(() => {
    if (!props.data) return [];
    const current = props.data.current;
    const previous = props.data.previous;

    return [
        {
            key: "income",
            label: t("reports.kpi.income"),
            icon: "iconoir:arrow-up-right",
            value: current.income,
            delta: formatPercentDelta(current.income, previous.income),
            colorClass: "text-success",
            deltaPositiveIsGood: true,
        },
        {
            key: "expense",
            label: t("reports.kpi.expense"),
            icon: "iconoir:arrow-down-right",
            value: current.expense,
            delta: formatPercentDelta(current.expense, previous.expense),
            colorClass: "text-destructive",
            deltaPositiveIsGood: false,
        },
        {
            key: "net",
            label: t("reports.kpi.net"),
            icon: "iconoir:coins",
            value: current.net,
            delta: formatPercentDelta(current.net, previous.net),
            colorClass: current.net >= 0 ? "text-success" : "text-destructive",
            deltaPositiveIsGood: true,
        },
        {
            key: "savingsRate",
            label: t("reports.kpi.savingsRate"),
            icon: "iconoir:piggy-bank",
            value: current.savingsRate,
            isPercentage: true,
            delta: formatPercentDelta(current.savingsRate, previous.savingsRate),
            colorClass: current.savingsRate >= 0 ? "text-success" : "text-destructive",
            deltaPositiveIsGood: true,
        },
    ];
});

function formatCurrency(value: number) {
    return toCurrency(value, props.currency);
}
</script>

<template>
    <div class="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <template v-if="loading">
            <div v-for="i in 4" :key="`skeleton-${i}`" class="bg-card border-border/60 rounded-2xl border p-5 shadow-sm">
                <Skeleton class="mb-3 h-4 w-24" />
                <Skeleton class="mb-2 h-8 w-32" />
                <Skeleton class="h-3 w-16" />
            </div>
        </template>
        <template v-else>
            <div
                v-for="(card, idx) in cards"
                :key="card.key"
                :style="{'--stagger-index': idx}"
                class="bg-card text-card-foreground border-border/60 relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md">
                <div
                    aria-hidden="true"
                    class="bg-brand-gradient-soft pointer-events-none absolute -top-16 -right-16 h-32 w-32 rounded-full opacity-40 blur-3xl"></div>
                <div class="relative flex items-center justify-between">
                    <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">{{ card.label }}</p>
                    <div :class="['flex size-8 items-center justify-center rounded-lg', 'bg-brand-gradient-soft']">
                        <Icon :class="['size-4', card.colorClass]" :name="card.icon" />
                    </div>
                </div>
                <p :class="['font-heading mt-3 text-2xl font-semibold tabular-nums', card.colorClass]">
                    <template v-if="card.isPercentage">{{ card.value.toFixed(1) }}%</template>
                    <template v-else>{{ formatCurrency(card.value) }}</template>
                </p>
                <p class="mt-1 flex items-center gap-1 text-xs">
                    <span
                        :class="[
                            'tabular-nums',
                            card.deltaPositiveIsGood
                                ? card.delta.positive
                                    ? 'text-success'
                                    : 'text-destructive'
                                : card.delta.positive
                                  ? 'text-destructive'
                                  : 'text-success',
                        ]">
                        {{ card.delta.label }}
                    </span>
                    <span class="text-muted-foreground">{{ t("reports.kpi.vsPrevious") }}</span>
                </p>
            </div>
        </template>
    </div>
</template>
