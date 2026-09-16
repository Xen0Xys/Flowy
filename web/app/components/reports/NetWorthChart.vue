<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useMediaQuery} from "@vueuse/core";
import {VisArea, VisAxis, VisXYContainer} from "@unovis/vue";
import {CurveType} from "@unovis/ts";
import {ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent} from "~/components/ui/chart";
import {toCurrency} from "~/lib/currency";
import {colorForIndex} from "~/utils/reports";
import type {NetWorthPoint} from "~/stores/report.store";

const props = defineProps<{
    data: NetWorthPoint[];
    currency: string;
    height?: number;
}>();

const {t, locale} = useI18n();
const isMobile = useMediaQuery("(max-width: 768px)");

const height = computed(() => props.height ?? 280);

const types = computed(() => {
    const set = new Set<string>();
    for (const point of props.data) {
        for (const key of Object.keys(point.byType)) set.add(key);
    }
    return [...set].sort();
});

type ChartRow = {
    dateMs: number;
    [type: string]: number;
};

const dataset = computed<ChartRow[]>(() =>
    props.data.map((point) => {
        const row: ChartRow = {dateMs: new Date(point.date).getTime()};
        for (const type of types.value) {
            row[type] = point.byType[type] ?? 0;
        }
        return row;
    }),
);

const chartConfig = computed(() => {
    const cfg: Record<string, {label: string; color: string}> = {};
    types.value.forEach((type, idx) => {
        cfg[type] = {
            label: t(`accounts.types.${type.toLowerCase()}`),
            color: colorForIndex(idx),
        };
    });
    return cfg;
});

const yAccessors = computed(() => types.value.map((type) => (d: ChartRow) => d[type] ?? 0));
const colorAccessors = computed(() => types.value.map((_, idx) => colorForIndex(idx)));

const xAccessor = (d: ChartRow) => d.dateMs;

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
                    <span class="inline-block size-2 rounded-full" style="background-color: ${colorForIndex(idx)}"></span>
                    <span class="text-muted-foreground">${chartConfig.value[type]?.label ?? type}</span>
                </span>
                <span class="tabular-nums font-medium">${toCurrency(value, props.currency)}</span>
            </div>`;
        })
        .join("");
    const total = types.value.reduce((sum, type) => sum + (d[type] ?? 0), 0);
    return `<div class="flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-sm min-w-40">
        <span class="text-[0.70rem] uppercase text-muted-foreground">${dateLabel}</span>
        ${rows}
        <div class="flex items-center justify-between border-t pt-1 mt-1 text-xs">
            <span class="text-muted-foreground">${t("reports.charts.netWorth.total")}</span>
            <span class="tabular-nums font-semibold">${toCurrency(total, props.currency)}</span>
        </div>
    </div>`;
}
</script>

<template>
    <div :style="{height: `${height}px`}">
        <ClientOnly>
            <ChartContainer :config="chartConfig">
                <VisXYContainer :data="dataset" :padding="{top: 10, bottom: 10, left: 0, right: 0}">
                    <VisArea
                        :curveType="CurveType.MonotoneX"
                        :x="xAccessor"
                        :y="yAccessors"
                        :color="colorAccessors"
                        :opacity="0.85" />
                    <VisAxis type="x" :gridLine="false" :numTicks="isMobile ? 3 : undefined" :tickFormat="formatDate" />
                    <VisAxis v-if="!isMobile" type="y" :gridLine="false" :tickFormat="formatCompactCurrency" />
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
