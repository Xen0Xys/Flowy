<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useCssVar, useMediaQuery} from "@vueuse/core";
import {VisArea, VisAxis, VisLine, VisScatter, VisXYContainer} from "@unovis/vue";
import {CurveType} from "@unovis/ts";
import {ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent} from "~/components/ui/chart";
import {toCurrency} from "~/lib/currency";
import type {NetWorthPoint} from "~/stores/report.store";

const props = defineProps<{
    data: NetWorthPoint[];
    currency: string;
    height?: number;
}>();

const {t, locale} = useI18n();
const isMobile = useMediaQuery("(max-width: 768px)");

const height = computed(() => props.height ?? 280);

const chart1 = useCssVar("--chart-1");
const chart2 = useCssVar("--chart-2");
const chart3 = useCssVar("--chart-3");
const chart4 = useCssVar("--chart-4");
const chart5 = useCssVar("--chart-5");
const successVar = useCssVar("--success");
const destructiveVar = useCssVar("--destructive");
const mutedFgVar = useCssVar("--muted-foreground");

const palette = computed(() => [
    chart1.value?.trim() || "oklch(0.65 0.18 258)",
    chart2.value?.trim() || "oklch(0.7 0.18 145)",
    chart3.value?.trim() || "oklch(0.75 0.18 60)",
    chart4.value?.trim() || "oklch(0.7 0.18 310)",
    chart5.value?.trim() || "oklch(0.7 0.18 25)",
]);

function colorAt(idx: number): string {
    const p = palette.value;
    return p[idx % p.length]!;
}

const types = computed(() => {
    const set = new Set<string>();
    for (const point of props.data) {
        for (const key of Object.keys(point.byType)) set.add(key);
    }
    return [...set].sort();
});

type ChartRow = {
    dateMs: number;
    total: number;
    [type: string]: number;
};

const dataset = computed<ChartRow[]>(() =>
    props.data.map((point) => {
        const row: ChartRow = {dateMs: new Date(point.date).getTime(), total: 0};
        let sum = 0;
        for (const type of types.value) {
            const value = point.byType[type] ?? 0;
            row[type] = value;
            sum += value;
        }
        row.total = sum;
        return row;
    }),
);

const chartConfig = computed(() => {
    const cfg: Record<string, {label: string; color: string}> = {
        total: {label: t("reports.charts.netWorth.total"), color: totalColor.value},
    };
    types.value.forEach((type, idx) => {
        cfg[type] = {
            label: t(`accounts.types.${type.toLowerCase()}`),
            color: colorAt(idx),
        };
    });
    return cfg;
});

const totalColor = computed(() => {
    const series = dataset.value;
    const fallback = mutedFgVar.value?.trim() || "oklch(0.55 0.02 250)";
    if (!series || series.length === 0) return fallback;
    const startValue = series[0]!.total;
    const endValue = series[series.length - 1]!.total;
    if (endValue > startValue) return successVar.value?.trim() || fallback;
    if (endValue < startValue) return destructiveVar.value?.trim() || fallback;
    return fallback;
});

const xAccessor = (d: ChartRow) => d.dateMs;
const yTotal = (d: ChartRow) => d.total;

function formatCompactCurrency(value: number) {
    return toCurrency(value, props.currency);
}

function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString(locale.value || "en-US", {month: "short", day: "numeric"});
}

function crosshairTemplate(d: ChartRow): string {
    const dateLabel = new Date(d.dateMs).toLocaleDateString(locale.value || "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    const rows = types.value
        .map((type, idx) => {
            const value = d[type] ?? 0;
            return `<div class="flex items-center justify-between gap-3 text-xs">
                <span class="flex items-center gap-1.5">
                    <span class="inline-block size-2 rounded-full" style="background-color: ${colorAt(idx)}"></span>
                    <span class="text-muted-foreground">${chartConfig.value[type]?.label ?? type}</span>
                </span>
                <span class="tabular-nums font-medium">${toCurrency(value, props.currency)}</span>
            </div>`;
        })
        .join("");
    return `<div class="flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-sm min-w-40">
        <span class="text-[0.70rem] uppercase text-muted-foreground">${dateLabel}</span>
        <div class="flex items-center justify-between border-b pb-1 mb-1 text-xs">
            <span class="text-muted-foreground">${t("reports.charts.netWorth.total")}</span>
            <span class="tabular-nums font-semibold">${toCurrency(d.total, props.currency)}</span>
        </div>
        ${rows}
    </div>`;
}
</script>

<template>
    <div :style="{height: `${height}px`}">
        <ClientOnly>
            <ChartContainer :config="chartConfig">
                <VisXYContainer :data="dataset" :padding="{top: 10, bottom: 10, left: 0, right: 0}">
                    <svg height="0" width="0">
                        <defs>
                            <linearGradient id="netWorthTotal" x1="0" x2="0" y1="0" y2="1">
                                <stop :stop-color="totalColor" offset="5%" stop-opacity="0.35" />
                                <stop :stop-color="totalColor" offset="95%" stop-opacity="0" />
                            </linearGradient>
                        </defs>
                    </svg>

                    <VisArea
                        :curveType="CurveType.MonotoneX"
                        :x="xAccessor"
                        :y="yTotal"
                        color="url(#netWorthTotal)"
                        :opacity="1" />

                    <VisLine
                        :curveType="CurveType.MonotoneX"
                        :x="xAccessor"
                        :y="yTotal"
                        :color="totalColor"
                        :lineWidth="2.5" />

                    <template v-for="(type, idx) in types" :key="type">
                        <VisLine
                            :curveType="CurveType.MonotoneX"
                            :x="xAccessor"
                            :y="(d: ChartRow) => d[type] ?? 0"
                            :color="colorAt(idx)"
                            :lineWidth="1.5" />
                    </template>

                    <VisScatter v-if="dataset.length === 1" :color="totalColor" :size="6" :x="xAccessor" :y="yTotal" />

                    <VisAxis type="x" :gridLine="false" :numTicks="isMobile ? 3 : undefined" :tickFormat="formatDate" />
                    <VisAxis
                        v-if="!isMobile"
                        type="y"
                        :gridLine="true"
                        :domainLine="false"
                        :tickFormat="formatCompactCurrency" />
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
