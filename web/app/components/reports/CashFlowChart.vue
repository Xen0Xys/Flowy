<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useCssVar, useMediaQuery} from "@vueuse/core";
import {VisArea, VisAxis, VisGroupedBar, VisLine, VisXYContainer} from "@unovis/vue";
import {CurveType} from "@unovis/ts";
import {ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent} from "~/components/ui/chart";
import {toCurrency} from "~/lib/currency";
import type {CashFlowPoint, ReportResolution} from "~/stores/report.store";

export type CashFlowMode = "flow" | "savings";

const props = withDefaults(
    defineProps<{
        data: CashFlowPoint[];
        currency: string;
        height?: number;
        resolution?: ReportResolution;
        mode?: CashFlowMode;
    }>(),
    {mode: "flow"},
);

const {t, locale} = useI18n();
const isMobile = useMediaQuery("(max-width: 768px)");

const successColor = useCssVar("--success");
const destructiveColor = useCssVar("--destructive");
const mutedFgVar = useCssVar("--muted-foreground");

function computeRate(income: number, expense: number): number {
    if (income <= 0) return 0;
    return Math.round(((income - expense) / income) * 1000) / 10;
}

type Row = {
    periodMs: number;
    income: number;
    expense: number;
    previousIncome: number;
    previousExpense: number;
    savingsRate: number;
    previousSavingsRate: number;
};

const dataset = computed<Row[]>(() =>
    props.data.map((p) => {
        const previousIncome = p.previousIncome ?? 0;
        const previousExpense = p.previousExpense ?? 0;
        return {
            periodMs: new Date(p.period).getTime(),
            income: p.income,
            expense: p.expense,
            previousIncome,
            previousExpense,
            savingsRate: computeRate(p.income, p.expense),
            previousSavingsRate: computeRate(previousIncome, previousExpense),
        };
    }),
);

const hasPrevious = computed(() =>
    props.data.some((p) => p.previousIncome !== undefined || p.previousExpense !== undefined),
);

const height = computed(() => props.height ?? 280);

const chartConfig = computed(() => ({
    income: {label: t("reports.kpi.income"), color: "var(--success)"},
    expense: {label: t("reports.kpi.expense"), color: "var(--destructive)"},
    savings: {label: t("reports.kpi.savingsRate"), color: savingsColor.value},
}));

const xAcc = (d: Row) => d.periodMs;
const yIncome = (d: Row) => d.income;
const yExpense = (d: Row) => d.expense;
const yPreviousIncome = (d: Row) => d.previousIncome;
const yPreviousExpense = (d: Row) => d.previousExpense;
const ySavings = (d: Row) => d.savingsRate;
const yPreviousSavings = (d: Row) => d.previousSavingsRate;

const incomeColor = computed(() => successColor.value?.trim() || "oklch(0.7 0.15 145)");
const expenseColor = computed(() => destructiveColor.value?.trim() || "oklch(0.6 0.2 25)");
const mutedColor = computed(() => mutedFgVar.value?.trim() || "oklch(0.55 0.02 250)");

const averageSavingsRate = computed(() => {
    if (dataset.value.length === 0) return 0;
    const sum = dataset.value.reduce((acc, r) => acc + r.savingsRate, 0);
    return Math.round((sum / dataset.value.length) * 10) / 10;
});

const savingsColor = computed(() => (averageSavingsRate.value >= 0 ? incomeColor.value : expenseColor.value));

const barColors = computed(() => [incomeColor.value, expenseColor.value]);

function formatCurrency(value: number) {
    return toCurrency(value, props.currency);
}

function formatPeriodTick(ms: number) {
    const loc = locale.value || "en-US";
    const date = new Date(ms);
    switch (props.resolution) {
        case "day":
        case "week":
            return date.toLocaleDateString(loc, {month: "short", day: "numeric"});
        case "year":
            return date.toLocaleDateString(loc, {year: "numeric"});
        default:
            return date.toLocaleDateString(loc, {month: "short", year: "2-digit"});
    }
}

function formatCrosshairDate(ms: number): string {
    const loc = locale.value || "en-US";
    const date = new Date(ms);
    switch (props.resolution) {
        case "day":
        case "week":
            return date.toLocaleDateString(loc, {year: "numeric", month: "long", day: "numeric"});
        case "year":
            return date.toLocaleDateString(loc, {year: "numeric"});
        default:
            return date.toLocaleDateString(loc, {year: "numeric", month: "long"});
    }
}

const flowRow = (label: string, value: string, color: string) => `
    <div class="flex items-center justify-between gap-3 text-xs">
        <span class="flex items-center gap-1.5">
            <span class="inline-block size-2 rounded-full" style="background-color: ${color}"></span>
            <span class="text-muted-foreground">${label}</span>
        </span>
        <span class="tabular-nums font-medium">${value}</span>
    </div>`;
const dashRow = (label: string, value: string, color: string) => `
    <div class="flex items-center justify-between gap-3 text-xs">
        <span class="flex items-center gap-1.5">
            <span class="inline-block h-[2px] w-3 rounded-full" style="background-color: ${color}"></span>
            <span class="text-muted-foreground">${label}</span>
        </span>
        <span class="tabular-nums font-medium">${value}</span>
    </div>`;

function crosshairTemplate(d: Row): string {
    const date = formatCrosshairDate(d.periodMs);
    if (props.mode === "savings") {
        const prev = hasPrevious.value
            ? dashRow(
                  t("reports.charts.cashFlow.previousSavingsRate"),
                  `${d.previousSavingsRate.toFixed(1)}%`,
                  mutedColor.value,
              )
            : "";
        return `<div class="flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-sm min-w-40">
            <span class="text-[0.70rem] uppercase text-muted-foreground">${date}</span>
            ${flowRow(t("reports.kpi.savingsRate"), `${d.savingsRate.toFixed(1)}%`, savingsColor.value)}
            ${prev}
        </div>`;
    }
    const prevRows = hasPrevious.value
        ? dashRow(t("reports.charts.cashFlow.previousIncome"), formatCurrency(d.previousIncome), incomeColor.value) +
          dashRow(t("reports.charts.cashFlow.previousExpense"), formatCurrency(d.previousExpense), expenseColor.value)
        : "";
    return `<div class="flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-sm min-w-40">
        <span class="text-[0.70rem] uppercase text-muted-foreground">${date}</span>
        ${flowRow(t("reports.kpi.income"), formatCurrency(d.income), incomeColor.value)}
        ${flowRow(t("reports.kpi.expense"), formatCurrency(d.expense), expenseColor.value)}
        ${prevRows}
    </div>`;
}

function yTickFormat(value: number) {
    return props.mode === "savings" ? `${value.toFixed(0)}%` : formatCurrency(value);
}
</script>

<template>
    <div class="flex flex-col gap-3">
        <div v-if="mode === 'savings'" class="flex items-baseline justify-between">
            <div>
                <p class="text-muted-foreground text-xs tracking-wide uppercase">
                    {{ t("reports.charts.cashFlow.averageSavings") }}
                </p>
                <p
                    :class="[
                        'font-heading text-2xl font-semibold tabular-nums',
                        averageSavingsRate >= 0 ? 'text-success' : 'text-destructive',
                    ]">
                    {{ averageSavingsRate.toFixed(1) }}%
                </p>
            </div>
        </div>
        <div :style="{height: `${height}px`}">
            <ClientOnly>
                <ChartContainer :config="chartConfig">
                    <VisXYContainer :data="dataset" :padding="{top: 10, bottom: 10, left: 0, right: 0}">
                        <template v-if="mode === 'flow'">
                            <VisGroupedBar :x="xAcc" :y="[yIncome, yExpense]" :color="barColors" :roundedCorners="4" />
                            <template v-if="hasPrevious">
                                <VisLine
                                    :curveType="CurveType.MonotoneX"
                                    :x="xAcc"
                                    :y="yPreviousIncome"
                                    :color="incomeColor"
                                    :lineWidth="1.5"
                                    :lineDashArray="[4, 3]" />
                                <VisLine
                                    :curveType="CurveType.MonotoneX"
                                    :x="xAcc"
                                    :y="yPreviousExpense"
                                    :color="expenseColor"
                                    :lineWidth="1.5"
                                    :lineDashArray="[4, 3]" />
                            </template>
                        </template>
                        <template v-else>
                            <svg height="0" width="0">
                                <defs>
                                    <linearGradient id="savingsRateFill" x1="0" x2="0" y1="0" y2="1">
                                        <stop :stop-color="savingsColor" offset="5%" stop-opacity="0.3" />
                                        <stop :stop-color="savingsColor" offset="95%" stop-opacity="0" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <VisArea
                                :curveType="CurveType.MonotoneX"
                                :x="xAcc"
                                :y="ySavings"
                                :opacity="1"
                                color="url(#savingsRateFill)" />
                            <VisLine
                                :curveType="CurveType.MonotoneX"
                                :x="xAcc"
                                :y="ySavings"
                                :color="savingsColor"
                                :lineWidth="2.5" />
                            <VisLine
                                v-if="hasPrevious"
                                :curveType="CurveType.MonotoneX"
                                :x="xAcc"
                                :y="yPreviousSavings"
                                :color="mutedColor"
                                :lineWidth="1.5"
                                :lineDashArray="[4, 3]" />
                        </template>
                        <VisAxis
                            type="x"
                            :gridLine="false"
                            :numTicks="isMobile ? 3 : undefined"
                            :tickFormat="formatPeriodTick" />
                        <VisAxis
                            v-if="!isMobile"
                            type="y"
                            :gridLine="true"
                            :domainLine="false"
                            :tickFormat="yTickFormat" />
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
    </div>
</template>
