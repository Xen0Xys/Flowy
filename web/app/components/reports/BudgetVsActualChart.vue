<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useCssVar, useMediaQuery} from "@vueuse/core";
import {VisAxis, VisGroupedBar, VisXYContainer} from "@unovis/vue";
import {ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent} from "~/components/ui/chart";
import {toCurrency} from "~/lib/currency";
import type {BudgetVsActualPoint} from "~/stores/report.store";

const props = defineProps<{
    data: BudgetVsActualPoint[];
    currency: string;
    height?: number;
}>();

const {t, locale} = useI18n();
const isMobile = useMediaQuery("(max-width: 768px)");

const primary = useCssVar("--primary");
const accent = useCssVar("--accent");
const destructive = useCssVar("--destructive");

type Row = {periodMs: number; budgeted: number; actual: number};

const dataset = computed<Row[]>(() =>
    props.data.map((p) => ({
        periodMs: new Date(p.period).getTime(),
        budgeted: p.budgetedExpense,
        actual: p.actualExpense,
    })),
);

const height = computed(() => props.height ?? 280);

const barColors = computed(() => {
    const budgetedColor = primary.value?.trim() || "oklch(0.6 0.18 258)";
    const actualColor = accent.value?.trim() || "oklch(0.7 0.15 145)";
    return [budgetedColor, actualColor];
});

const chartConfig = computed(() => ({
    budgeted: {label: t("reports.charts.budgetVsActual.budgeted"), color: barColors.value[0]!},
    actual: {label: t("reports.charts.budgetVsActual.actual"), color: barColors.value[1]!},
}));

const xAcc = (d: Row) => d.periodMs;
const yBudgeted = (d: Row) => d.budgeted;
const yActual = (d: Row) => d.actual;

function formatCurrency(value: number) {
    return toCurrency(value, props.currency);
}

function formatPeriodTick(ms: number) {
    return new Date(ms).toLocaleDateString(locale.value || "en-US", {month: "short", year: "2-digit"});
}

function crosshairTemplate(d: Row): string {
    const date = new Date(d.periodMs).toLocaleDateString(locale.value || "en-US", {year: "numeric", month: "long"});
    const overspent = d.actual > d.budgeted;
    const diffColor = overspent ? destructive.value?.trim() || "oklch(0.6 0.2 25)" : barColors.value[1]!;
    const diff = d.actual - d.budgeted;
    const diffSign = diff >= 0 ? "+" : "";
    return `<div class="flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-sm min-w-44">
        <span class="text-[0.70rem] uppercase text-muted-foreground">${date}</span>
        <div class="flex items-center justify-between gap-3 text-xs">
            <span class="flex items-center gap-1.5">
                <span class="inline-block size-2 rounded-full" style="background-color: ${barColors.value[0]}"></span>
                <span class="text-muted-foreground">${t("reports.charts.budgetVsActual.budgeted")}</span>
            </span>
            <span class="tabular-nums font-medium">${formatCurrency(d.budgeted)}</span>
        </div>
        <div class="flex items-center justify-between gap-3 text-xs">
            <span class="flex items-center gap-1.5">
                <span class="inline-block size-2 rounded-full" style="background-color: ${barColors.value[1]}"></span>
                <span class="text-muted-foreground">${t("reports.charts.budgetVsActual.actual")}</span>
            </span>
            <span class="tabular-nums font-medium">${formatCurrency(d.actual)}</span>
        </div>
        <div class="flex items-center justify-between gap-3 border-t pt-1 mt-1 text-xs">
            <span class="text-muted-foreground">${t("reports.charts.budgetVsActual.difference")}</span>
            <span class="tabular-nums font-semibold" style="color: ${diffColor}">${diffSign}${formatCurrency(diff)}</span>
        </div>
    </div>`;
}
</script>

<template>
    <div :style="{height: `${height}px`}">
        <ClientOnly>
            <ChartContainer :config="chartConfig">
                <VisXYContainer :data="dataset" :padding="{top: 10, bottom: 10, left: 0, right: 0}">
                    <VisGroupedBar :x="xAcc" :y="[yBudgeted, yActual]" :color="barColors" :roundedCorners="4" />
                    <VisAxis
                        type="x"
                        :gridLine="false"
                        :numTicks="isMobile ? 3 : undefined"
                        :tickFormat="formatPeriodTick" />
                    <VisAxis v-if="!isMobile" type="y" :gridLine="false" :tickFormat="formatCurrency" />
                    <ChartCrosshair :template="crosshairTemplate" />
                    <ChartTooltip :customComponent="ChartTooltipContent" />
                </VisXYContainer>
            </ChartContainer>
            <template #fallback>
                <div class="flex h-full items-center justify-center">
                    <Icon class="text-muted-foreground size-6 animate-spin" name="svg-spinners:180-ring-with-bg" />
                </div>
            </template>
        </ClientOnly>
    </div>
</template>
