<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useMediaQuery} from "@vueuse/core";
import {VisAxis, VisStackedBar, VisXYContainer} from "@unovis/vue";
import {ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent} from "~/components/ui/chart";
import {toCurrency} from "~/lib/currency";
import {escapeHtml} from "~/lib/utils";
import type {CategoryTrend} from "~/stores/report.store";
import type {ReportResolution} from "~/utils/reports";

const props = defineProps<{
    data: CategoryTrend;
    currency: string;
    height?: number;
    maxCategories?: number;
    resolution?: ReportResolution;
}>();

const {t, locale} = useI18n();
const isMobile = useMediaQuery("(max-width: 768px)");

const maxCategories = computed(() => props.maxCategories ?? 8);

const topCategories = computed(() => props.data.categories.slice(0, maxCategories.value));

const topCategoryKeys = computed(() => topCategories.value.map((c) => c.categoryId ?? "__uncategorized__"));

type Row = {periodMs: number; [key: string]: number};

const dataset = computed<Row[]>(() =>
    props.data.points.map((p) => {
        const row: Row = {periodMs: new Date(p.period).getTime()};
        let othersTotal = 0;
        for (const [catId, value] of Object.entries(p.spentByCategoryId)) {
            if (topCategoryKeys.value.includes(catId)) {
                row[catId] = value;
            } else {
                othersTotal += value;
            }
        }
        for (const key of topCategoryKeys.value) {
            if (row[key] === undefined) row[key] = 0;
        }
        if (othersTotal > 0) row.__others__ = Math.round(othersTotal * 100) / 100;
        return row;
    }),
);

const hasOthers = computed(() => dataset.value.some((r) => (r.__others__ ?? 0) > 0));

const seriesKeys = computed(() => {
    const keys = [...topCategoryKeys.value];
    if (hasOthers.value) keys.push("__others__");
    return keys;
});

const seriesColors = computed(() =>
    seriesKeys.value.map((key) => {
        if (key === "__others__") return "var(--muted-foreground)";
        const cat = topCategories.value.find((c) => (c.categoryId ?? "__uncategorized__") === key);
        return cat?.hexColor ?? "var(--muted-foreground)";
    }),
);

const seriesLabels = computed(() => {
    const map: Record<string, string> = {};
    for (const key of topCategoryKeys.value) {
        const cat = topCategories.value.find((c) => (c.categoryId ?? "__uncategorized__") === key);
        map[key] = cat?.categoryId ? cat.name : t("budget.category.uncategorized");
    }
    if (hasOthers.value) map.__others__ = t("reports.charts.categoryTrend.others");
    return map;
});

const chartConfig = computed(() => {
    const cfg: Record<string, {label: string; color: string}> = {};
    seriesKeys.value.forEach((key, idx) => {
        cfg[key] = {label: seriesLabels.value[key] ?? key, color: seriesColors.value[idx]!};
    });
    return cfg;
});

const yAccessors = computed(() => seriesKeys.value.map((key) => (d: Row) => d[key] ?? 0));

const xAcc = (d: Row) => d.periodMs;

const height = computed(() => props.height ?? 300);

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

function crosshairTemplate(d: Row): string {
    const date = escapeHtml(formatCrosshairDate(d.periodMs));
    const rows = seriesKeys.value
        .map((key, idx) => {
            const value = d[key] ?? 0;
            if (value <= 0) return "";
            return `<div class="flex items-center justify-between gap-3 text-xs">
                <span class="flex items-center gap-1.5">
                    <span class="inline-block size-2 rounded-full" style="background-color: ${escapeHtml(seriesColors.value[idx])}"></span>
                    <span class="text-muted-foreground">${escapeHtml(seriesLabels.value[key])}</span>
                </span>
                <span class="tabular-nums font-medium">${escapeHtml(formatCurrency(value))}</span>
            </div>`;
        })
        .filter(Boolean)
        .join("");
    const total = seriesKeys.value.reduce((sum, key) => sum + (d[key] ?? 0), 0);
    return `<div class="flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-sm min-w-40">
        <span class="text-[0.70rem] uppercase text-muted-foreground">${date}</span>
        ${rows}
        <div class="flex items-center justify-between border-t pt-1 mt-1 text-xs">
            <span class="text-muted-foreground">${escapeHtml(t("common.all"))}</span>
            <span class="tabular-nums font-semibold">${escapeHtml(formatCurrency(total))}</span>
        </div>
    </div>`;
}
</script>

<template>
    <div :style="{height: `${height}px`}">
        <ClientOnly>
            <ChartContainer :config="chartConfig">
                <VisXYContainer :data="dataset" :padding="{top: 10, bottom: 10, left: 0, right: 0}">
                    <VisStackedBar :x="xAcc" :y="yAccessors" :color="seriesColors" :roundedCorners="3" />
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
