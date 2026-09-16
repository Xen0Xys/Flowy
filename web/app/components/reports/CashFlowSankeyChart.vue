<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useCssVar} from "@vueuse/core";
import {VisSankey, VisSingleContainer} from "@unovis/vue";
import {SankeyNodeAlign, type SankeyInputLink, type SankeyInputNode} from "@unovis/ts";
import {toCurrency} from "~/lib/currency";
import type {CashFlowSankey, CashFlowSankeyNode} from "~/stores/report.store";

const props = defineProps<{
    data: CashFlowSankey;
    currency: string;
    height?: number;
}>();

const {t} = useI18n();

const successVar = useCssVar("--success");
const destructiveVar = useCssVar("--destructive");
const primaryVar = useCssVar("--primary");
const mutedFgVar = useCssVar("--muted-foreground");

const incomeColor = computed(() => successVar.value?.trim() || "oklch(0.7 0.15 145)");
const expenseColor = computed(() => destructiveVar.value?.trim() || "oklch(0.6 0.2 25)");
const hubColor = computed(() => primaryVar.value?.trim() || "oklch(0.6 0.18 258)");
const mutedColor = computed(() => mutedFgVar.value?.trim() || "oklch(0.55 0.02 250)");

const height = computed(() => props.height ?? 380);

type SankeyNode = SankeyInputNode & CashFlowSankeyNode;
type SankeyLink = SankeyInputLink & {source: string; target: string; value: number};

const chartData = computed<{nodes: SankeyNode[]; links: SankeyLink[]}>(() => ({
    nodes: props.data.nodes.map((n) => ({...n, id: n.id})),
    links: props.data.links.map((l) => ({source: l.source, target: l.target, value: l.value})),
}));

function labelForNode(node: SankeyNode): string {
    switch (node.kind) {
        case "hub":
            if (node.id === "__revenue__") return t("reports.charts.cashFlowSankey.revenue");
            if (node.id === "__spending__") return t("reports.charts.cashFlowSankey.spending");
            return "";
        case "savings":
            return t("reports.charts.cashFlowSankey.savings");
        case "deficit":
            return t("reports.charts.cashFlowSankey.deficit");
        case "income":
        case "expense":
            return node.label || t("reports.charts.cashFlowSankey.uncategorized");
        default:
            return node.label ?? "";
    }
}

function subLabelForNode(node: SankeyNode & {value?: number}): string {
    if (typeof node.value !== "number") return "";
    return toCurrency(node.value, props.currency);
}

function colorForNode(node: SankeyNode): string {
    switch (node.kind) {
        case "income":
        case "savings":
            return incomeColor.value;
        case "expense":
        case "deficit":
            return expenseColor.value;
        case "hub":
            return hubColor.value;
        default:
            return mutedColor.value;
    }
}

function colorForLink(link: {source: SankeyNode; target: SankeyNode}): string {
    if (link.source.kind === "deficit") return expenseColor.value;
    if (link.target.kind === "savings") return incomeColor.value;
    if (link.target.kind === "expense") return expenseColor.value;
    if (link.source.kind === "income") return incomeColor.value;
    return hubColor.value;
}

const isEmpty = computed(() => chartData.value.nodes.length === 0 || chartData.value.links.length === 0);
</script>

<template>
    <div :style="{height: `${height}px`}">
        <ClientOnly>
            <div v-if="isEmpty" class="flex h-full items-center justify-center">
                <p class="text-muted-foreground text-sm">{{ t("reports.empty.noData") }}</p>
            </div>
            <VisSingleContainer v-else :data="chartData" :height="height">
                <VisSankey
                    :nodeAlign="SankeyNodeAlign.Justify"
                    :nodeWidth="10"
                    :nodePadding="8"
                    :nodeMinHeight="12"
                    :nodeMaxHeight="120"
                    :labelFontSize="12"
                    :labelMaxWidth="120"
                    :labelMaxWidthTakeAvailableSpace="true"
                    :showSingleNode="false"
                    :highlightSubtreeOnHover="true"
                    :enableZoom="false"
                    :label="labelForNode"
                    :subLabel="subLabelForNode"
                    :nodeColor="colorForNode"
                    :linkColor="colorForLink" />
            </VisSingleContainer>
            <template #fallback>
                <div class="flex h-full items-center justify-center">
                    <Icon class="text-muted-foreground size-6 animate-spin" name="svg-spinners:180-ring-with-bg" />
                </div>
            </template>
        </ClientOnly>
    </div>
</template>
