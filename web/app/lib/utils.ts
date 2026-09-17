import type {ClassValue} from "clsx";
import {clsx} from "clsx";
import {twMerge} from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Any user-controlled string interpolated in a `crosshairTemplate` (or any
// Unovis tooltip HTML) MUST be passed through this helper: Unovis renders the
// returned string via d3-selection's `.html()`, which sets innerHTML.
export function escapeHtml(value: unknown): string {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
