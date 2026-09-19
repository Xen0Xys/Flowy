// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {afterEach, beforeEach, describe, expect, mock, test} from "bun:test";
import {ConfigService} from "@nestjs/config";
import {UpdatesService} from "../src/modules/updates/updates.service";

function makeConfig(version: string | undefined): ConfigService {
    return {
        get: (key: string) => (key === "npm_package_version" ? version : undefined),
    } as unknown as ConfigService;
}

const originalFetch = globalThis.fetch;

function stubFetch(response: unknown, ok = true, status = 200): void {
    globalThis.fetch = mock(async () => {
        return {
            ok,
            status,
            statusText: ok ? "OK" : "Error",
            json: async () => response,
        } as unknown as Response;
    }) as unknown as typeof fetch;
}

describe("UpdatesService", () => {
    beforeEach(() => {
        // Ensure fresh mock for every test
        globalThis.fetch = originalFetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test("getState returns unknown when no version is configured", () => {
        const service = new UpdatesService(makeConfig(undefined));
        const state = service.getState();
        expect(state.currentVersion).toBe("unknown");
        expect(state.updateAvailable).toBe(false);
        expect(state.latest).toBeNull();
        expect(state.checkedAt).toBeNull();
    });

    test("refresh: skips when current version is unknown", async () => {
        const service = new UpdatesService(makeConfig(undefined));
        stubFetch([]);
        await service.refresh();
        expect((globalThis.fetch as unknown as {mock: {calls: unknown[]}}).mock.calls.length).toBe(0);
        expect(service.getState().checkedAt).toBeNull();
    });

    test("refresh: reports update when a newer stable release exists", async () => {
        const service = new UpdatesService(makeConfig("1.0.0"));
        stubFetch([
            {
                tag_name: "v1.2.0",
                name: "1.2.0",
                html_url: "https://example/1.2.0",
                published_at: "2026-03-01T00:00:00Z",
                draft: false,
                prerelease: false,
            },
            {
                tag_name: "v1.0.0",
                name: "1.0.0",
                html_url: "https://example/1.0.0",
                published_at: "2026-01-01T00:00:00Z",
                draft: false,
                prerelease: false,
            },
        ]);
        await service.refresh();
        const state = service.getState();
        expect(state.updateAvailable).toBe(true);
        expect(state.latest?.tagName).toBe("v1.2.0");
        expect(state.checkedAt).not.toBeNull();
    });

    test("refresh: excludes prerelease when current version is stable", async () => {
        const service = new UpdatesService(makeConfig("1.0.0"));
        stubFetch([
            {
                tag_name: "v1.1.0-beta.1",
                name: "1.1.0-beta.1",
                html_url: "https://example/beta",
                published_at: "2026-03-01T00:00:00Z",
                draft: false,
                prerelease: true,
            },
        ]);
        await service.refresh();
        expect(service.getState().updateAvailable).toBe(false);
    });

    test("refresh: includes prerelease when current version is itself prerelease", async () => {
        const service = new UpdatesService(makeConfig("2.0.0-beta.1"));
        stubFetch([
            {
                tag_name: "v2.0.0-beta.2",
                name: "2.0.0-beta.2",
                html_url: "https://example/2.0.0-beta.2",
                published_at: "2026-03-05T00:00:00Z",
                draft: false,
                prerelease: true,
            },
        ]);
        await service.refresh();
        const state = service.getState();
        expect(state.updateAvailable).toBe(true);
        expect(state.latest?.tagName).toBe("v2.0.0-beta.2");
    });

    test("refresh: no update when latest tag is not greater than current", async () => {
        const service = new UpdatesService(makeConfig("2.0.0"));
        stubFetch([
            {
                tag_name: "v1.9.9",
                name: "1.9.9",
                html_url: "https://example/1.9.9",
                published_at: "2026-01-01T00:00:00Z",
                draft: false,
                prerelease: false,
            },
        ]);
        await service.refresh();
        expect(service.getState().updateAvailable).toBe(false);
    });

    test("refresh: swallows fetch failure and keeps previous state", async () => {
        const service = new UpdatesService(makeConfig("1.0.0"));
        stubFetch("error body", false, 502);
        await service.refresh();
        expect(service.getState().updateAvailable).toBe(false);
    });

    test("refresh: filters out draft releases", async () => {
        const service = new UpdatesService(makeConfig("1.0.0"));
        stubFetch([
            {
                tag_name: "v9.9.9",
                name: "9.9.9",
                html_url: "https://example/draft",
                published_at: "2026-03-01T00:00:00Z",
                draft: true,
                prerelease: false,
            },
        ]);
        await service.refresh();
        expect(service.getState().updateAvailable).toBe(false);
    });

    test("refresh: is re-entrant safe (concurrent calls do not double-fetch)", async () => {
        const service = new UpdatesService(makeConfig("1.0.0"));
        let resolveGate: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
            resolveGate = resolve;
        });
        globalThis.fetch = mock(async () => {
            await gate;
            return {
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => [],
            } as unknown as Response;
        }) as unknown as typeof fetch;

        const first = service.refresh();
        const second = service.refresh();
        resolveGate();
        await Promise.all([first, second]);

        expect((globalThis.fetch as unknown as {mock: {calls: unknown[]}}).mock.calls.length).toBe(1);
    });
});
