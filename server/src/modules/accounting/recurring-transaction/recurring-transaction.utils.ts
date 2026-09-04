import {RecurrenceFrequency} from "../../../../prisma/generated/enums";

const TARGET_HOUR = 6;
const TARGET_MINUTE = 0;

const MONTHLY_INTERVAL: Record<Exclude<RecurrenceFrequency, "WEEKLY">, number> = {
    MONTHLY: 1,
    BIMONTHLY: 2,
    QUARTERLY: 3,
    SEMIANNUAL: 6,
    YEARLY: 12,
};

export interface RecurrenceInput {
    frequency: RecurrenceFrequency;
    day_of_month: number | null;
    day_of_week: number | null;
    timezone: string;
}

export function isValidTimezone(tz: string): boolean {
    if (!tz || typeof tz !== "string") return false;
    try {
        Intl.DateTimeFormat("en-US", {timeZone: tz});
        return true;
    } catch {
        return false;
    }
}

export function daysInMonth(year: number, month1: number): number {
    return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

interface LocalParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    weekday: number;
}

function getLocalParts(instant: Date, tz: string): LocalParts {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        weekday: "short",
        hourCycle: "h23",
    });
    const parts = dtf.formatToParts(instant);
    const map: Record<string, string> = {};
    for (const part of parts) {
        if (part.type !== "literal") map[part.type] = part.value;
    }
    const weekdayMap: Record<string, number> = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6};
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        hour: Number(map.hour) % 24,
        minute: Number(map.minute),
        weekday: weekdayMap[map.weekday!] ?? 0,
    };
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
    let utcGuess = Date.UTC(year, month - 1, day, hour, minute);
    for (let attempt = 0; attempt < 3; attempt++) {
        const guessDate = new Date(utcGuess);
        const parts = getLocalParts(guessDate, tz);
        const asUtcFromLocal = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
        const offsetMs = asUtcFromLocal - guessDate.getTime();
        const candidate = Date.UTC(year, month - 1, day, hour, minute) - offsetMs;
        if (candidate === utcGuess) return new Date(candidate);
        utcGuess = candidate;
    }
    return new Date(utcGuess);
}

export function computeNextRunAt(rt: RecurrenceInput, after: Date): Date {
    if (!isValidTimezone(rt.timezone)) {
        throw new Error(`Invalid timezone: ${rt.timezone}`);
    }
    if (rt.frequency === "WEEKLY") {
        if (rt.day_of_week === null || rt.day_of_week === undefined) {
            throw new Error("day_of_week is required for WEEKLY frequency");
        }
        return computeNextWeekly(rt.day_of_week, rt.timezone, after);
    }
    if (rt.day_of_month === null || rt.day_of_month === undefined) {
        throw new Error("day_of_month is required for monthly-based frequencies");
    }
    const interval = MONTHLY_INTERVAL[rt.frequency];
    return computeNextMonthly(rt.day_of_month, interval, rt.timezone, after);
}

function computeNextMonthly(day: number, interval: number, tz: string, after: Date): Date {
    const local = getLocalParts(after, tz);
    let year = local.year;
    let month = local.month;
    for (let i = 0; i < 24; i++) {
        const clampedDay = Math.min(day, daysInMonth(year, month));
        const candidate = zonedTimeToUtc(year, month, clampedDay, TARGET_HOUR, TARGET_MINUTE, tz);
        if (candidate.getTime() > after.getTime()) return candidate;
        month += interval;
        while (month > 12) {
            month -= 12;
            year += 1;
        }
    }
    throw new Error("Could not compute next monthly run within 24 iterations");
}

function computeNextWeekly(dayOfWeek: number, tz: string, after: Date): Date {
    const local = getLocalParts(after, tz);
    let year = local.year;
    let month = local.month;
    let day = local.day;
    for (let i = 0; i < 14; i++) {
        const candidate = zonedTimeToUtc(year, month, day, TARGET_HOUR, TARGET_MINUTE, tz);
        const candidateWeekday = getLocalParts(candidate, tz).weekday;
        if (candidateWeekday === dayOfWeek && candidate.getTime() > after.getTime()) {
            return candidate;
        }
        const next = new Date(Date.UTC(year, month - 1, day + 1));
        year = next.getUTCFullYear();
        month = next.getUTCMonth() + 1;
        day = next.getUTCDate();
    }
    throw new Error("Could not compute next weekly run within 14 iterations");
}

export function enumerateOccurrencesInMonth(rt: RecurrenceInput, anchor: Date, year: number, month: number): Date[] {
    if (!isValidTimezone(rt.timezone)) return [];

    if (rt.frequency === "WEEKLY") {
        if (rt.day_of_week === null || rt.day_of_week === undefined) return [];
        return enumerateWeeklyInMonth(rt.day_of_week, rt.timezone, year, month);
    }

    if (rt.day_of_month === null || rt.day_of_month === undefined) return [];
    const interval = MONTHLY_INTERVAL[rt.frequency];

    const anchorLocal = getLocalParts(anchor, rt.timezone);
    const monthDiff = (year - anchorLocal.year) * 12 + (month - anchorLocal.month);
    const remainder = ((monthDiff % interval) + interval) % interval;
    if (remainder !== 0) return [];

    const clampedDay = Math.min(rt.day_of_month, daysInMonth(year, month));
    return [zonedTimeToUtc(year, month, clampedDay, TARGET_HOUR, TARGET_MINUTE, rt.timezone)];
}

function enumerateWeeklyInMonth(dayOfWeek: number, tz: string, year: number, month: number): Date[] {
    const results: Date[] = [];
    const totalDays = daysInMonth(year, month);
    for (let day = 1; day <= totalDays; day++) {
        const candidate = zonedTimeToUtc(year, month, day, TARGET_HOUR, TARGET_MINUTE, tz);
        if (getLocalParts(candidate, tz).weekday === dayOfWeek) {
            results.push(candidate);
        }
    }
    return results;
}
