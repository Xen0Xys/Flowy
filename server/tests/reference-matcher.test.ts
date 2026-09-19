// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {describe, expect, test} from "bun:test";
import {ReferenceMatcherService} from "../src/modules/accounting/reference/reference-matcher.service";

type Entity = {id: string; name: string; keywords: string[]; auto_complete_enabled: boolean};

function makeService(): ReferenceMatcherService {
    return new ReferenceMatcherService({} as any);
}

describe("ReferenceMatcherService.findBestMatch", () => {
    test("returns null when description is empty after normalization", () => {
        const service = makeService();
        expect(service.findBestMatch("", [{id: "a", name: "Store", keywords: [], auto_complete_enabled: true}])).toBe(
            null,
        );
    });

    test("matches against the entity name", () => {
        const service = makeService();
        const entities: Entity[] = [
            {id: "cat-1", name: "Groceries", keywords: [], auto_complete_enabled: true},
        ];
        expect(service.findBestMatch("Weekly groceries at market", entities)).toBe("cat-1");
    });

    test("matches against keywords when the name does not appear", () => {
        const service = makeService();
        const entities: Entity[] = [
            {id: "cat-1", name: "Food", keywords: ["carrefour", "auchan"], auto_complete_enabled: true},
        ];
        expect(service.findBestMatch("Payment CARREFOUR Paris", entities)).toBe("cat-1");
    });

    test("prefers the longest matching candidate across entities", () => {
        const service = makeService();
        const entities: Entity[] = [
            {id: "short", name: "Cafe", keywords: [], auto_complete_enabled: true},
            {id: "long", name: "Cafeteria Central", keywords: [], auto_complete_enabled: true},
        ];
        expect(service.findBestMatch("Lunch cafeteria central today", entities)).toBe("long");
    });

    test("ignores entities where auto_complete_enabled is false", () => {
        const service = makeService();
        const entities: Entity[] = [
            {id: "off", name: "Groceries", keywords: [], auto_complete_enabled: false},
        ];
        expect(service.findBestMatch("Weekly groceries", entities)).toBe(null);
    });

    test("strips diacritics before comparing", () => {
        const service = makeService();
        const entities: Entity[] = [
            {id: "id-1", name: "Épicerie", keywords: [], auto_complete_enabled: true},
        ];
        expect(service.findBestMatch("Achat Epicerie du coin", entities)).toBe("id-1");
    });

    test("returns null when no candidate is contained in the description", () => {
        const service = makeService();
        const entities: Entity[] = [
            {id: "id-1", name: "Restaurant", keywords: ["diner", "brunch"], auto_complete_enabled: true},
        ];
        expect(service.findBestMatch("Coffee shop", entities)).toBe(null);
    });

    test("skips blank/whitespace-only candidates in keywords", () => {
        const service = makeService();
        const entities: Entity[] = [
            {id: "id-1", name: "  ", keywords: ["   ", "sushi"], auto_complete_enabled: true},
        ];
        expect(service.findBestMatch("Dinner sushi tonight", entities)).toBe("id-1");
    });
});
