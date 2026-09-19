<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useCssVar, useMediaQuery} from "@vueuse/core";
import {VisAxis, VisGroupedBar, VisXYContainer} from "@unovis/vue";
import {ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent} from "~/components/ui/chart";
import {toCurrency} from "~/lib/currency";
import type {CashFlowPoint, ReportResolution} from "~/stores/report.store";

const props = defineProps<{
    data: CashFlowPoint[];
    currency: string;
    height?: number;
    resolution?: ReportResolution;
}>();

const {t, locale} = useI18n();
const isMobile = useMediaQuery("(max-width: 768px)");

const successColor = useCssVar("--success");
const destructiveColor = useCssVar("--destructive");

type Row = {periodMs: number; income: number; expense: number};

const dataset = computed<Row[]>(() =>
    props.data.map((p) => ({
        periodMs: new Date(p.period).getTime(),
        income: p.income,
        expense: p.expense,
    })),
);

const height = computed(() => props.height ?? 280);

const chartConfig = computed(() => ({
    income: {label: t("reports.kpi.income"), color: "var(--success)"},
    expense: {label: t("reports.kpi.expense"), color: "var(--destructive)"},
}));

const xAcc = (d: Row) => d.periodMs;
const yIncome = (d: Row) => d.income;
const yExpense = (d: Row) => d.expense;

const incomeColor = computed(() => successColor.value?.trim() || "oklch(0.7 0.15 145)");
const expenseColor = computed(() => destructiveColor.value?.trim() || "oklch(0.6 0.2 25)");

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
            return date.toLocaleDateString(loc, {year: "numeric", month: "long", day: "numeric"});
        case "week":
            return date.toLocaleDateString(loc, {year: "numeric", month: "long", day: "numeric"});
        case "year":
            return date.toLocaleDateString(loc, {year: "numeric"});
        default:
            return date.toLocaleDateString(loc, {year: "numeric", month: "long"});
    }
}

function crosshairTemplate(d: Row): string {
    const date = formatCrosshairDate(d.periodMs);
    const rowHtml = (label: string, value: string, color: string) => `
        <div class="flex items-center justify-between gap-3 text-xs">
            <span class="flex items-center gap-1.5">
                <span class="inline-block size-2 rounded-full" style="background-color: ${color}"></span>
                <span class="text-muted-foreground">${label}</span>
            </span>
            <span class="tabular-nums font-medium">${value}</span>
        </div>`;
    return `<div class="flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-sm min-w-40">
        <span class="text-[0.70rem] uppercase text-muted-foreground">${date}</span>
        ${rowHtml(t("reports.kpi.income"), formatCurrency(d.income), incomeColor.value)}
        ${rowHtml(t("reports.kpi.expense"), formatCurrency(d.expense), expenseColor.value)}
    </div>`;
}
</script>

<template>
    <div :style="{height: `${height}px`}">
        <ClientOnly>
            <ChartContainer :config="chartConfig">
                <VisXYContainer :data="dataset" :padding="{top: 10, bottom: 10, left: 0, right: 0}">
                    <VisGroupedBar :x="xAcc" :y="[yIncome, yExpense]" :color="barColors" :roundedCorners="4" />
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
                        :tickFormat="formatCurrency" />
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
