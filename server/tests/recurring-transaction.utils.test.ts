// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {describe, expect, test} from "bun:test";
import {
    computeNextRunAt,
    daysInMonth,
    enumerateOccurrencesInMonth,
    isValidTimezone,
} from "../src/modules/accounting/recurring-transaction/recurring-transaction.utils";

describe("isValidTimezone", () => {
    test("accepts common IANA tz", () => {
        expect(isValidTimezone("Europe/Paris")).toBe(true);
        expect(isValidTimezone("America/New_York")).toBe(true);
        expect(isValidTimezone("UTC")).toBe(true);
    });

    test("rejects invalid inputs", () => {
        expect(isValidTimezone("Not/A_Zone")).toBe(false);
        expect(isValidTimezone("")).toBe(false);
    });
});

describe("daysInMonth", () => {
    test("returns correct days for common months", () => {
        expect(daysInMonth(2026, 1)).toBe(31);
        expect(daysInMonth(2026, 2)).toBe(28);
        expect(daysInMonth(2024, 2)).toBe(29); // leap year
        expect(daysInMonth(2026, 4)).toBe(30);
        expect(daysInMonth(2026, 12)).toBe(31);
    });
});

describe("computeNextRunAt - MONTHLY", () => {
    test("returns same-month occurrence when after is early in month", () => {
        const after = new Date("2026-03-01T00:00:00Z");
        const next = computeNextRunAt(
            {frequency: "MONTHLY", day_of_month: 15, day_of_week: null, timezone: "Europe/Paris"},
            after,
        );
        // 15 March 06:00 Paris = 05:00 UTC (CET during March 15 is CET before DST)
        expect(next.getUTCMonth()).toBe(2); // March = 2
        expect(next.getUTCDate()).toBe(15);
    });

    test("advances to next month when day already passed", () => {
        const after = new Date("2026-03-20T00:00:00Z");
        const next = computeNextRunAt(
            {frequency: "MONTHLY", day_of_month: 15, day_of_week: null, timezone: "Europe/Paris"},
            after,
        );
        expect(next.getUTCMonth()).toBe(3); // April
        expect(next.getUTCDate()).toBe(15);
    });

    test("clamps day 31 to last day of shorter month", () => {
        const after = new Date("2026-02-01T00:00:00Z");
        const next = computeNextRunAt(
            {frequency: "MONTHLY", day_of_month: 31, day_of_week: null, timezone: "Europe/Paris"},
            after,
        );
        expect(next.getUTCMonth()).toBe(1); // February = 1
        expect(next.getUTCDate()).toBe(28); // 2026 not a leap year
    });

    test("clamps day 31 to 29 in leap February", () => {
        const after = new Date("2024-02-01T00:00:00Z");
        const next = computeNextRunAt(
            {frequency: "MONTHLY", day_of_month: 31, day_of_week: null, timezone: "Europe/Paris"},
            after,
        );
        expect(next.getUTCMonth()).toBe(1);
        expect(next.getUTCDate()).toBe(29);
    });

    test("target hour is 06:00 local", () => {
        const after = new Date("2026-06-01T00:00:00Z");
        const next = computeNextRunAt(
            {frequency: "MONTHLY", day_of_month: 15, day_of_week: null, timezone: "Europe/Paris"},
            after,
        );
        // June = CEST = UTC+2, so 06:00 Paris = 04:00 UTC
        expect(next.toISOString()).toBe("2026-06-15T04:00:00.000Z");
    });
});

describe("computeNextRunAt - QUARTERLY", () => {
    test("advances by 3 months", () => {
        const after = new Date("2026-03-15T06:00:00Z");
        const next = computeNextRunAt(
            {frequency: "QUARTERLY", day_of_month: 15, day_of_week: null, timezone: "UTC"},
            after,
        );
        expect(next.getUTCMonth()).toBe(5); // June
        expect(next.getUTCDate()).toBe(15);
    });
});

describe("computeNextRunAt - YEARLY", () => {
    test("advances by 12 months", () => {
        const after = new Date("2026-06-15T06:00:00Z");
        const next = computeNextRunAt(
            {frequency: "YEARLY", day_of_month: 15, day_of_week: null, timezone: "UTC"},
            after,
        );
        expect(next.getUTCFullYear()).toBe(2027);
        expect(next.getUTCMonth()).toBe(5);
        expect(next.getUTCDate()).toBe(15);
    });
});

describe("computeNextRunAt - WEEKLY", () => {
    test("finds next occurrence of dayOfWeek", () => {
        // 2026-03-04 is a Wednesday
        const after = new Date("2026-03-04T00:00:00Z");
        const next = computeNextRunAt({frequency: "WEEKLY", day_of_month: null, day_of_week: 5, timezone: "UTC"}, after);
        // Friday = 5, next Friday is 2026-03-06
        expect(next.getUTCFullYear()).toBe(2026);
        expect(next.getUTCMonth()).toBe(2);
        expect(next.getUTCDate()).toBe(6);
    });

    test("advances to next week if target day already passed today at 06:00", () => {
        // 2026-03-06 is a Friday at 07:00 UTC (after 06:00 UTC)
        const after = new Date("2026-03-06T07:00:00Z");
        const next = computeNextRunAt({frequency: "WEEKLY", day_of_month: null, day_of_week: 5, timezone: "UTC"}, after);
        expect(next.getUTCDate()).toBe(13); // next Friday
    });
});

describe("computeNextRunAt - DST", () => {
    test("Europe/Paris spring-forward day (2026-03-29)", () => {
        // DST starts 2026-03-29 in Europe. At 06:00 Paris = CEST = UTC+2 = 04:00 UTC
        const after = new Date("2026-03-28T12:00:00Z");
        const next = computeNextRunAt(
            {frequency: "MONTHLY", day_of_month: 29, day_of_week: null, timezone: "Europe/Paris"},
            after,
        );
        expect(next.toISOString()).toBe("2026-03-29T04:00:00.000Z");
    });

    test("Europe/Paris fall-back day (2026-10-25)", () => {
        // DST ends 2026-10-25 in Europe. At 06:00 Paris = CET = UTC+1 = 05:00 UTC
        const after = new Date("2026-10-24T12:00:00Z");
        const next = computeNextRunAt(
            {frequency: "MONTHLY", day_of_month: 25, day_of_week: null, timezone: "Europe/Paris"},
            after,
        );
        expect(next.toISOString()).toBe("2026-10-25T05:00:00.000Z");
    });
});

describe("enumerateOccurrencesInMonth", () => {
    test("MONTHLY yields one occurrence per month", () => {
        const anchor = new Date("2026-05-10T06:00:00Z");
        const list = enumerateOccurrencesInMonth(
            {frequency: "MONTHLY", day_of_month: 10, day_of_week: null, timezone: "UTC"},
            anchor,
            2026,
            5,
        );
        expect(list.length).toBe(1);
        expect(list[0]!.getUTCDate()).toBe(10);
        expect(list[0]!.getUTCMonth()).toBe(4);
    });

    test("MONTHLY yields one occurrence in any month regardless of anchor", () => {
        const anchor = new Date("2026-01-10T06:00:00Z");
        const list = enumerateOccurrencesInMonth(
            {frequency: "MONTHLY", day_of_month: 10, day_of_week: null, timezone: "UTC"},
            anchor,
            2026,
            8,
        );
        expect(list.length).toBe(1);
        expect(list[0]!.getUTCMonth()).toBe(7); // August
    });

    test("WEEKLY yields 4-5 occurrences per month", () => {
        const anchor = new Date("2026-03-02T06:00:00Z");
        const list = enumerateOccurrencesInMonth(
            {frequency: "WEEKLY", day_of_month: null, day_of_week: 1, timezone: "UTC"},
            anchor,
            2026,
            3,
        );
        expect(list.length).toBeGreaterThanOrEqual(4);
        expect(list.length).toBeLessThanOrEqual(5);
        for (const d of list) {
            expect(d.getUTCDay()).toBe(1);
            expect(d.getUTCMonth()).toBe(2); // March
        }
    });

    test("YEARLY yields 1 in anchor month, 0 elsewhere", () => {
        const anchor = new Date("2026-03-15T06:00:00Z");
        const listMarch = enumerateOccurrencesInMonth(
            {frequency: "YEARLY", day_of_month: 15, day_of_week: null, timezone: "UTC"},
            anchor,
            2026,
            3,
        );
        expect(listMarch.length).toBe(1);
        const listJune = enumerateOccurrencesInMonth(
            {frequency: "YEARLY", day_of_month: 15, day_of_week: null, timezone: "UTC"},
            anchor,
            2026,
            6,
        );
        expect(listJune.length).toBe(0);
    });

    test("BIMONTHLY alternates months from anchor", () => {
        const anchor = new Date("2026-03-15T06:00:00Z");
        const rt = {frequency: "BIMONTHLY" as const, day_of_month: 15, day_of_week: null, timezone: "UTC"};
        expect(enumerateOccurrencesInMonth(rt, anchor, 2026, 3).length).toBe(1);
        expect(enumerateOccurrencesInMonth(rt, anchor, 2026, 4).length).toBe(0);
        expect(enumerateOccurrencesInMonth(rt, anchor, 2026, 5).length).toBe(1);
        expect(enumerateOccurrencesInMonth(rt, anchor, 2026, 7).length).toBe(1);
    });
});
