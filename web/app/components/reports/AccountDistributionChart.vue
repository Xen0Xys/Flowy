<script lang="ts" setup>
import {computed, ref} from "vue";
import {useI18n} from "vue-i18n";
import {arc, pie} from "d3-shape";
import {toCurrency} from "~/lib/currency";
import {colorForIndex} from "~/utils/reports";
import type {AccountBreakdown} from "~/stores/report.store";

const props = defineProps<{
    data: AccountBreakdown[];
    currency: string;
}>();

const {t, te} = useI18n();

const items = computed(() =>
    props.data.map((a, idx) => ({
        ...a,
        color: colorForIndex(idx),
        totalActivity: a.income + a.expense,
    })),
);

const total = computed(() => items.value.reduce((sum, i) => sum + i.totalActivity, 0));

const pieLayout = computed(() => {
    const p = pie<{value: number}>();
    p.value((d) => d.value);
    p.sort(null);
    p.padAngle(0.01);
    return p;
});

const arcPath = computed(() => {
    const a = arc<{startAngle: number; endAngle: number}>();
    a.innerRadius(80);
    a.outerRadius(120);
    a.cornerRadius(4);
    return a;
});

const segments = computed(() => {
    if (total.value === 0) return [];
    const arcs = pieLayout.value(items.value.map((i) => ({value: i.totalActivity})));
    return arcs.map((slice, idx) => ({
        path: arcPath.value(slice) ?? "",
        item: items.value[idx]!,
    }));
});

const hoveredIndex = ref<number | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);
const containerRef = ref<HTMLElement | null>(null);

function handleHover(event: MouseEvent, idx: number) {
    hoveredIndex.value = idx;
    const container = containerRef.value;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    tooltipX.value = event.clientX - rect.left;
    tooltipY.value = event.clientY - rect.top;
}

function handleLeave() {
    hoveredIndex.value = null;
}

function formatCurrency(value: number) {
    return toCurrency(value, props.currency);
}

function typeLabel(type: string) {
    const key = `accounts.types.${type.toLowerCase()}`;
    return te(key) ? t(key) : type;
}
</script>

<template>
    <div ref="containerRef" class="relative flex flex-col items-center gap-4 md:flex-row md:items-start">
        <div class="relative shrink-0">
            <svg class="h-56 w-56" viewBox="0 0 260 260">
                <circle class="stroke-muted" cx="130" cy="130" fill="none" r="100" stroke-width="40" />
                <g transform="translate(130, 130)">
                    <path
                        v-for="(seg, idx) in segments"
                        :key="idx"
                        :d="seg.path"
                        :fill="seg.item.color"
                        :opacity="hoveredIndex === null || hoveredIndex === idx ? 0.9 : 0.4"
                        class="cursor-pointer transition-opacity"
                        @mouseenter="handleHover($event, idx)"
                        @mouseleave="handleLeave"
                        @mousemove="handleHover($event, idx)" />
                </g>
                <text class="fill-muted-foreground" font-size="11" text-anchor="middle" x="130" y="125">
                    {{ t("reports.charts.byAccount.activity") }}
                </text>
                <text
                    class="fill-foreground font-heading text-lg font-semibold"
                    style="font-variant-numeric: tabular-nums"
                    text-anchor="middle"
                    x="130"
                    y="145">
                    {{ formatCurrency(total) }}
                </text>
            </svg>

            <div
                v-if="hoveredIndex !== null"
                :style="{left: `${tooltipX}px`, top: `${tooltipY - 60}px`, transform: 'translateX(-50%)'}"
                class="bg-popover pointer-events-none absolute z-50 min-w-40 rounded-md border px-3 py-2 text-xs shadow-md">
                <div class="flex items-center gap-1.5 font-medium">
                    <span
                        class="inline-block size-2 rounded-full"
                        :style="{backgroundColor: items[hoveredIndex]?.color}"></span>
                    <span>{{ items[hoveredIndex]?.name }}</span>
                </div>
                <div class="text-muted-foreground mt-1 flex justify-between">
                    <span>{{ t("reports.kpi.income") }}</span>
                    <span class="text-success tabular-nums"
                        >+{{ formatCurrency(items[hoveredIndex]?.income ?? 0) }}</span
                    >
                </div>
                <div class="text-muted-foreground flex justify-between">
                    <span>{{ t("reports.kpi.expense") }}</span>
                    <span class="text-destructive tabular-nums"
                        >-{{ formatCurrency(items[hoveredIndex]?.expense ?? 0) }}</span
                    >
                </div>
            </div>
        </div>

        <ul class="flex flex-1 flex-col gap-1.5 text-sm">
            <li v-for="(item, idx) in items" :key="item.accountId" class="flex items-center justify-between gap-3">
                <span class="flex min-w-0 items-center gap-2">
                    <span
                        class="inline-block size-2 shrink-0 rounded-full"
                        :style="{backgroundColor: item.color}"></span>
                    <span class="min-w-0 truncate">
                        <span class="font-medium">{{ item.name }}</span>
                        <span class="text-muted-foreground ml-1 text-xs">· {{ typeLabel(item.type) }}</span>
                    </span>
                </span>
                <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {{ total > 0 ? ((item.totalActivity / total) * 100).toFixed(0) : 0 }}%
                </span>
            </li>
        </ul>
    </div>
</template>
