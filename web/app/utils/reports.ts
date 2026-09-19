export type ReportRange = "7D" | "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL" | "CUSTOM";

export const REPORT_RANGES: Exclude<ReportRange, "CUSTOM">[] = ["7D", "1M", "3M", "6M", "1Y", "YTD", "ALL"];

export type ReportResolution = "day" | "week" | "month" | "quarter" | "year";

export const REPORT_RESOLUTIONS: ReportResolution[] = ["day", "week", "month", "quarter", "year"];

export function defaultResolutionFor(range: ReportRange): ReportResolution {
    switch (range) {
        case "7D":
            return "day";
        case "1M":
        case "3M":
            return "week";
        case "6M":
        case "1Y":
        case "YTD":
            return "month";
        case "ALL":
            return "quarter";
        case "CUSTOM":
            return "month";
    }
}

export function buildReportDateRange(preset: Exclude<ReportRange, "CUSTOM">): {startDate: string; endDate: string} {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();

    let start: Date;
    switch (preset) {
        case "7D":
            start = new Date(Date.UTC(y, m, d - 7, 0, 0, 0, 0));
            break;
        case "1M":
            start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
            break;
        case "3M":
            start = new Date(Date.UTC(y, m - 2, 1, 0, 0, 0, 0));
            break;
        case "6M":
            start = new Date(Date.UTC(y, m - 5, 1, 0, 0, 0, 0));
            break;
        case "1Y":
            start = new Date(Date.UTC(y, m - 11, 1, 0, 0, 0, 0));
            break;
        case "YTD":
            start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
            break;
        case "ALL":
            start = new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 0));
            break;
    }

    return {
        startDate: start.toISOString(),
        endDate: now.toISOString(),
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
