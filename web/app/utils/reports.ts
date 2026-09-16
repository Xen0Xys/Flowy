export type ReportRange = "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL" | "CUSTOM";

export const REPORT_RANGES: Exclude<ReportRange, "CUSTOM">[] = ["1M", "3M", "6M", "1Y", "YTD", "ALL"];

export function buildReportDateRange(preset: Exclude<ReportRange, "CUSTOM">): {startDate: string; endDate: string} {
    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (preset) {
        case "1M":
            start.setMonth(end.getMonth() - 1);
            break;
        case "3M":
            start.setMonth(end.getMonth() - 3);
            break;
        case "6M":
            start.setMonth(end.getMonth() - 6);
            break;
        case "1Y":
            start.setFullYear(end.getFullYear() - 1);
            break;
        case "YTD":
            start.setMonth(0);
            start.setDate(1);
            break;
        case "ALL":
            start.setFullYear(2000);
            start.setMonth(0);
            start.setDate(1);
            break;
    }

    return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
    };
}

// Palette used to color arbitrary categorical series (net-worth by account type,
// stacked bars, etc.) when a series does not carry its own color.
export const REPORT_CHART_PALETTE = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
];

export function colorForIndex(index: number): string {
    return REPORT_CHART_PALETTE[index % REPORT_CHART_PALETTE.length]!;
}

export function formatPercentDelta(
    current: number,
    previous: number,
): {value: number; label: string; positive: boolean} {
    if (previous === 0) {
        if (current === 0) return {value: 0, label: "0%", positive: true};
        return {value: 100, label: current > 0 ? "+∞" : "-∞", positive: current > 0};
    }
    const raw = ((current - previous) / Math.abs(previous)) * 100;
    const rounded = Math.round(raw * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return {value: rounded, label: `${sign}${rounded}%`, positive: rounded >= 0};
}
