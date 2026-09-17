<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useCssVar, useMediaQuery} from "@vueuse/core";
import {VisArea, VisAxis, VisLine, VisXYContainer} from "@unovis/vue";
import {CurveType} from "@unovis/ts";
import {ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent} from "~/components/ui/chart";
import type {CashFlowPoint} from "~/stores/report.store";

const props = defineProps<{
    data: CashFlowPoint[];
    height?: number;
}>();

const {t, locale} = useI18n();
const isMobile = useMediaQuery("(max-width: 768px)");
const successColor = useCssVar("--success");
const destructiveColor = useCssVar("--destructive");

type Row = {periodMs: number; rate: number};

const dataset = computed<Row[]>(() =>
    props.data.map((p) => ({
        periodMs: new Date(p.period).getTime(),
        rate: p.income > 0 ? Math.round(((p.income - p.expense) / p.income) * 1000) / 10 : 0,
    })),
);

const averageRate = computed(() => {
    if (dataset.value.length === 0) return 0;
    const sum = dataset.value.reduce((acc, r) => acc + r.rate, 0);
    return Math.round((sum / dataset.value.length) * 10) / 10;
});

const height = computed(() => props.height ?? 200);

const chartColor = computed(() => {
    if (averageRate.value >= 0) return successColor.value?.trim() || "oklch(0.7 0.15 145)";
    return destructiveColor.value?.trim() || "oklch(0.6 0.2 25)";
});

const chartConfig = computed(() => ({
    rate: {label: t("reports.kpi.savingsRate"), color: chartColor.value},
}));

const xAcc = (d: Row) => d.periodMs;
const yAcc = (d: Row) => d.rate;

function formatPeriodTick(ms: number) {
    return new Date(ms).toLocaleDateString(locale.value || "en-US", {month: "short", year: "2-digit"});
}

function crosshairTemplate(d: Row): string {
    const date = new Date(d.periodMs).toLocaleDateString(locale.value || "en-US", {year: "numeric", month: "long"});
    return `<div class="flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-sm">
        <span class="text-[0.70rem] uppercase text-muted-foreground">${date}</span>
        <span class="font-bold tabular-nums">${d.rate.toFixed(1)}%</span>
    </div>`;
}
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="flex items-baseline justify-between">
            <div>
                <p class="text-muted-foreground text-xs tracking-wide uppercase">
                    {{ t("reports.charts.savingsRate.average") }}
                </p>
                <p
                    :class="[
                        'font-heading text-2xl font-semibold tabular-nums',
                        averageRate >= 0 ? 'text-success' : 'text-destructive',
                    ]">
                    {{ averageRate.toFixed(1) }}%
                </p>
            </div>
            <p class="text-muted-foreground text-xs">
                {{ t("reports.charts.savingsRate.monthsCount", {count: dataset.length}) }}
            </p>
        </div>
        <div :style="{height: `${height}px`}">
            <ClientOnly>
                <ChartContainer :config="chartConfig">
                    <VisXYContainer :data="dataset" :padding="{top: 10, bottom: 10, left: 0, right: 0}">
                        <svg height="0" width="0">
                            <defs>
                                <linearGradient id="savingsRateGradient" x1="0" x2="0" y1="0" y2="1">
                                    <stop :stop-color="chartColor" offset="5%" stop-opacity="0.3" />
                                    <stop :stop-color="chartColor" offset="95%" stop-opacity="0" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <VisArea
                            :curveType="CurveType.MonotoneX"
                            :x="xAcc"
                            :y="yAcc"
                            :opacity="1"
                            color="url(#savingsRateGradient)" />
                        <VisLine
                            :curveType="CurveType.MonotoneX"
                            :x="xAcc"
                            :y="yAcc"
                            :color="chartColor"
                            :lineWidth="2.5" />
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
                            :tickFormat="(d: number) => `${d.toFixed(0)}%`" />
                        <ChartCrosshair :color="chartColor" :template="crosshairTemplate" />
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
