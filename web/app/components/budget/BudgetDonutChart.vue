<script lang="ts" setup>
import {computed, ref} from "vue";
import {arc, pie} from "d3-shape";
import {toCurrency} from "~/lib/currency";

interface DonutSegment {
    label: string;
    value: number;
    color: string;
    icon?: string;
    budgeted: number;
    spent: number;
}

const props = defineProps<{
    segments: DonutSegment[];
    totalBudgeted: number;
    totalSpent: number;
    actualIncome: number;
    currency: string;
    hasBudget?: boolean;
}>();

const isOverBudget = computed(() => props.totalSpent > props.totalBudgeted);
const overAmount = computed(() => Math.round((props.totalSpent - props.totalBudgeted) * 100) / 100);

const fillRatio = computed(() => {
    if (props.totalBudgeted === 0) return 1;
    return Math.min(props.totalSpent / props.totalBudgeted, 1);
});

const donutData = computed(() => {
    if (props.totalSpent === 0) return [];
    return props.segments.map((s) => ({
        ...s,
        value: s.value,
    }));
});

const pieLayout = computed(() => {
    const p = pie<{value: number; color: string}>();
    p.value((d) => d.value);
    p.sort(null);
    return p;
});

const arcPath = computed(() => {
    const a = arc<{startAngle: number; endAngle: number; padAngle?: number}>();
    a.innerRadius(100);
    a.outerRadius(140);
    a.cornerRadius(6);
    return a;
});

const pieData = computed(() => {
    if (props.totalSpent === 0) return [];
    const data = donutData.value.map((s) => ({value: s.value, color: s.color}));
    const pieSlices = pieLayout.value(data);

    // Scale angles so the donut only partially fills when spent < budgeted
    if (fillRatio.value < 1) {
        const totalAngle = 2 * Math.PI * fillRatio.value;
        const currentTotalEnd = pieSlices[pieSlices.length - 1]?.endAngle ?? 0;
        if (currentTotalEnd > 0) {
            const scale = totalAngle / currentTotalEnd;
            return pieSlices.map((d) => ({
                ...d,
                startAngle: d.startAngle * scale,
                endAngle: d.endAngle * scale,
            }));
        }
    }

    return pieSlices;
});

const segmentPaths = computed(() => {
    return pieData.value.map((d, i) => ({
        path: arcPath.value(d) ?? "",
        color: donutData.value[i]?.color,
        label: donutData.value[i]?.label,
        budgeted: donutData.value[i]?.budgeted ?? 0,
        spent: donutData.value[i]?.spent ?? 0,
    }));
});

// Tooltip state (positioned absolutely outside the SVG)
const hoveredIndex = ref<number | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);
const containerRef = ref<HTMLElement | null>(null);

function handleSegmentHover(event: MouseEvent, idx: number) {
    hoveredIndex.value = idx;
    const container = containerRef.value;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    tooltipX.value = event.clientX - rect.left;
    tooltipY.value = event.clientY - rect.top;
}

function handleSegmentLeave() {
    hoveredIndex.value = null;
}

const incomeProgress = computed(() => {
    if (props.totalBudgeted === 0) return 0;
    return (props.actualIncome / props.totalBudgeted) * 100;
});

const isOverIncome = computed(() => props.actualIncome > props.totalBudgeted);
const extraIncome = computed(() => Math.round((props.actualIncome - props.totalBudgeted) * 100) / 100);

const formatCurrency = (value: number) => {
    return toCurrency(value, props.currency);
};
</script>

<template>
    <div ref="containerRef" class="relative flex flex-col items-center">
        <svg class="h-72 w-72" viewBox="0 0 280 280">
            <!-- Background circle -->
            <circle class="stroke-muted" cx="140" cy="140" fill="none" r="120" stroke-width="40" />

            <!-- Segments -->
            <g transform="translate(140, 140)">
                <path
                    v-for="(seg, idx) in segmentPaths"
                    :key="idx"
                    :d="seg.path"
                    :fill="seg.color"
                    :opacity="totalSpent > 0 ? 0.85 : 0"
                    class="cursor-pointer transition-opacity hover:opacity-100"
                    @mouseenter="handleSegmentHover($event, idx)"
                    @mouseleave="handleSegmentLeave"
                    @mousemove="handleSegmentHover($event, idx)" />
            </g>

            <!-- Center text -->
            <text
                v-if="hasBudget !== false"
                class="fill-foreground text-3xl font-bold"
                text-anchor="middle"
                x="140"
                y="120">
                {{ formatCurrency(totalSpent) }}
            </text>
            <template v-if="hasBudget !== false">
                <text class="fill-muted-foreground" font-size="13" text-anchor="middle" x="140" y="142">
                    {{ $t("budget.donut.centerSpent") }}
                </text>
                <text class="fill-muted-foreground" font-size="13" text-anchor="middle" x="140" y="164">
                    {{ formatCurrency(totalBudgeted) }} {{ $t("budget.donut.centerBudgeted") }}
                </text>
            </template>
            <text v-else class="fill-muted-foreground" font-size="13" text-anchor="middle" x="140" y="152">
                {{ $t("budget.donut.noBudgetForMonth") }}
            </text>
        </svg>

        <!-- Tooltip (absolute positioned, above all SVG content) -->
        <div
            v-if="hoveredIndex !== null"
            :style="{left: `${tooltipX}px`, top: `${tooltipY - 50}px`, transform: 'translateX(-50%)'}"
            class="bg-popover pointer-events-none absolute z-50 min-w-32 rounded-md border px-3 py-2 text-xs shadow-md">
            <div class="font-medium">
                {{ segmentPaths[hoveredIndex]?.label }}
            </div>
            <div class="text-muted-foreground mt-0.5">
                {{ formatCurrency(segmentPaths[hoveredIndex]?.spent ?? 0) }}
                / {{ formatCurrency(segmentPaths[hoveredIndex]?.budgeted ?? 0) }}
            </div>
        </div>

        <!-- Over budget warning -->
        <div
            v-if="hasBudget !== false && isOverBudget"
            class="text-destructive mt-2 flex items-center gap-1 text-sm font-medium">
            <Icon class="h-4 w-4" name="iconoir:warning-triangle" />
            {{ $t("budget.donut.centerOver") }}: +{{ formatCurrency(overAmount) }}
        </div>

        <!-- Income progress bar -->
        <div v-if="totalBudgeted > 0" class="mt-4 w-full max-w-xs">
            <div class="mb-1 flex items-center justify-between text-sm">
                <span class="text-muted-foreground">{{ $t("budget.donut.incomeProgress") }}</span>
                <span :class="isOverIncome ? 'text-green-500' : ''" class="font-semibold tabular-nums"
                    >{{ incomeProgress.toFixed(0) }}%</span
                >
            </div>
            <div class="bg-muted h-2.5 overflow-hidden rounded-full">
                <div
                    :class="isOverIncome ? 'bg-green-500' : incomeProgress >= 100 ? 'bg-green-500' : 'bg-primary'"
                    :style="{width: `${Math.min(incomeProgress, 100)}%`}"
                    class="h-full rounded-full transition-all duration-500" />
            </div>
            <div class="mt-1 flex justify-between text-xs tabular-nums">
                <span class="text-muted-foreground">{{ formatCurrency(actualIncome) }}</span>
                <span class="text-muted-foreground">{{ formatCurrency(totalBudgeted) }}</span>
            </div>
            <!-- Extra income display -->
            <div v-if="isOverIncome" class="mt-2 flex items-center gap-1 text-sm font-medium text-green-500">
                <Icon class="h-4 w-4" name="iconoir:arrow-up-right" />
                {{ $t("budget.donut.extraIncome") }}: +{{ formatCurrency(extraIncome) }}
            </div>
        </div>
    </div>
</template>
