<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useCssVar, useMediaQuery} from "@vueuse/core";
import {VisAxis, VisGroupedBar, VisLine, VisXYContainer} from "@unovis/vue";
import {CurveType} from "@unovis/ts";
import {ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent} from "~/components/ui/chart";
import {toCurrency} from "~/lib/currency";
import type {CashFlowPoint} from "~/stores/report.store";

const props = defineProps<{
    data: CashFlowPoint[];
    currency: string;
    height?: number;
}>();

const {t, locale} = useI18n();
const isMobile = useMediaQuery("(max-width: 768px)");

const successColor = useCssVar("--success");
const destructiveColor = useCssVar("--destructive");
const primaryColor = useCssVar("--primary");

type Row = {periodMs: number; income: number; expense: number; net: number};

const dataset = computed<Row[]>(() =>
    props.data.map((p) => ({
        periodMs: new Date(p.period).getTime(),
        income: p.income,
        expense: p.expense,
        net: p.net,
    })),
);

const height = computed(() => props.height ?? 280);

const chartConfig = computed(() => ({
    income: {label: t("reports.kpi.income"), color: "var(--success)"},
    expense: {label: t("reports.kpi.expense"), color: "var(--destructive)"},
    net: {label: t("reports.kpi.net"), color: "var(--primary)"},
}));

const xAcc = (d: Row) => d.periodMs;
const yIncome = (d: Row) => d.income;
const yExpense = (d: Row) => d.expense;
const yNet = (d: Row) => d.net;

const barColors = computed(() => [
    successColor.value?.trim() || "oklch(0.7 0.15 145)",
    destructiveColor.value?.trim() || "oklch(0.6 0.2 25)",
]);
const netColor = computed(() => primaryColor.value?.trim() || "oklch(0.6 0.18 258)");

function formatCurrency(value: number) {
    return toCurrency(value, props.currency);
}

function formatPeriodTick(ms: number) {
    return new Date(ms).toLocaleDateString(locale.value || "en-US", {month: "short", year: "2-digit"});
}

function crosshairTemplate(d: Row): string {
    const date = new Date(d.periodMs).toLocaleDateString(locale.value || "en-US", {year: "numeric", month: "long"});
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
        ${rowHtml(t("reports.kpi.income"), formatCurrency(d.income), barColors.value[0]!)}
        ${rowHtml(t("reports.kpi.expense"), `-${formatCurrency(d.expense)}`, barColors.value[1]!)}
        <div class="flex items-center justify-between gap-3 border-t pt-1 mt-1 text-xs">
            <span class="text-muted-foreground">${t("reports.kpi.net")}</span>
            <span class="tabular-nums font-semibold" style="color: ${d.net >= 0 ? barColors.value[0] : barColors.value[1]}">${formatCurrency(d.net)}</span>
        </div>
    </div>`;
}
</script>

<template>
    <div :style="{height: `${height}px`}">
        <ClientOnly>
            <ChartContainer :config="chartConfig">
                <VisXYContainer :data="dataset" :padding="{top: 10, bottom: 10, left: 0, right: 0}">
                    <VisGroupedBar :x="xAcc" :y="[yIncome, yExpense]" :color="barColors" :roundedCorners="4" />
                    <VisLine :curveType="CurveType.MonotoneX" :x="xAcc" :y="yNet" :color="netColor" :lineWidth="2" />
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
