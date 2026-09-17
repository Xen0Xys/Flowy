<script lang="ts" setup>
import {computed, ref} from "vue";
import {useI18n} from "vue-i18n";
import {arc, pie} from "d3-shape";
import {toCurrency} from "~/lib/currency";
import type {CategoryBreakdown} from "~/stores/report.store";

const props = defineProps<{
    data: CategoryBreakdown[];
    currency: string;
}>();

const {t} = useI18n();

const total = computed(() => props.data.reduce((sum, d) => sum + d.spent, 0));

const items = computed(() =>
    props.data.map((c) => ({
        ...c,
        label: c.categoryId ? c.name : t("budget.category.uncategorized"),
    })),
);

const pieLayout = computed(() => {
    const p = pie<{value: number}>();
    p.value((d) => d.value);
    p.sort(null);
    p.padAngle(0.008);
    return p;
});

const arcPath = computed(() => {
    const a = arc<{startAngle: number; endAngle: number}>();
    a.innerRadius(90);
    a.outerRadius(130);
    a.cornerRadius(4);
    return a;
});

const segments = computed(() => {
    if (total.value === 0) return [];
    const arcs = pieLayout.value(items.value.map((i) => ({value: i.spent})));
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

const topThree = computed(() => items.value.slice(0, 3));
</script>

<template>
    <div ref="containerRef" class="relative flex flex-col items-center gap-4">
        <svg class="h-64 w-64" viewBox="0 0 280 280">
            <circle class="stroke-muted" cx="140" cy="140" fill="none" r="110" stroke-width="40" />
            <g transform="translate(140, 140)">
                <path
                    v-for="(seg, idx) in segments"
                    :key="idx"
                    :d="seg.path"
                    :fill="seg.item.hexColor"
                    :opacity="hoveredIndex === null || hoveredIndex === idx ? 0.9 : 0.4"
                    class="cursor-pointer transition-opacity"
                    @mouseenter="handleHover($event, idx)"
                    @mouseleave="handleLeave"
                    @mousemove="handleHover($event, idx)" />
            </g>
            <text
                class="fill-foreground font-heading text-2xl font-semibold"
                style="font-variant-numeric: tabular-nums"
                text-anchor="middle"
                x="140"
                y="135">
                {{ formatCurrency(total) }}
            </text>
            <text class="fill-muted-foreground" font-size="12" text-anchor="middle" x="140" y="155">
                {{ t("reports.charts.byCategory.totalSpent") }}
            </text>
        </svg>

        <div
            v-if="hoveredIndex !== null"
            :style="{left: `${tooltipX}px`, top: `${tooltipY - 50}px`, transform: 'translateX(-50%)'}"
            class="bg-popover pointer-events-none absolute z-50 min-w-32 rounded-md border px-3 py-2 text-xs shadow-md">
            <div class="flex items-center gap-1.5">
                <span
                    class="inline-block size-2 rounded-full"
                    :style="{backgroundColor: items[hoveredIndex]?.hexColor}"></span>
                <span class="font-medium">{{ items[hoveredIndex]?.label }}</span>
            </div>
            <div class="text-muted-foreground mt-0.5 tabular-nums">
                {{ formatCurrency(items[hoveredIndex]?.spent ?? 0) }}
                <span v-if="total > 0" class="ml-1">
                    ({{ (((items[hoveredIndex]?.spent ?? 0) / total) * 100).toFixed(1) }}%)
                </span>
            </div>
        </div>

        <ul v-if="topThree.length > 0" class="w-full space-y-1.5 text-sm">
            <li v-for="(item, idx) in topThree" :key="idx" class="flex items-center justify-between gap-3">
                <span class="flex min-w-0 items-center gap-2">
                    <span
                        class="inline-block size-2 shrink-0 rounded-full"
                        :style="{backgroundColor: item.hexColor}"></span>
                    <Icon v-if="item.icon" :name="item.icon" class="text-muted-foreground size-3.5 shrink-0" />
                    <span class="truncate">{{ item.label }}</span>
                </span>
                <span class="text-muted-foreground shrink-0 tabular-nums">{{ formatCurrency(item.spent) }}</span>
            </li>
        </ul>
    </div>
</template>
