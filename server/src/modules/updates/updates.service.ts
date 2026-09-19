import {Injectable, Logger} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import {LatestReleaseEntity, UpdateStatusEntity} from "./models/entities/update-status.entity";

const GITHUB_REPO = "Xen0Xys/Flowy";
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const FETCH_TIMEOUT_MS = 5_000;

type GithubRelease = {
    tag_name: string;
    name: string;
    html_url: string;
    published_at: string;
    draft: boolean;
    prerelease: boolean;
};

type ParsedVersion = {
    core: number[];
    prerelease: (number | string)[] | null;
};

function normalizeVersion(v: string): string {
    return v.trim().replace(/^v/i, "");
}

function isPrereleaseVersion(v: string): boolean {
    return /-/.test(normalizeVersion(v));
}

function parseVersion(v: string): ParsedVersion | null {
    // Strip SemVer build metadata (everything after `+`) before splitting on `-`.
    const normalized = normalizeVersion(v).split("+", 1)[0] ?? "";
    const [coreStr, prereleaseStr] = normalized.split("-", 2);
    const core = (coreStr ?? "").split(".").map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : NaN));
    if (core.length === 0 || core.some((n) => Number.isNaN(n))) return null;
    const prerelease =
        prereleaseStr === undefined
            ? null
            : prereleaseStr.split(".").map((part) => {
                  const n = parseInt(part, 10);
                  return Number.isNaN(n) || String(n) !== part ? part : n;
              });
    return {core, prerelease};
}

function compareIdentifiers(a: number | string, b: number | string): number {
    const aIsNum = typeof a === "number";
    const bIsNum = typeof b === "number";
    if (aIsNum && bIsNum) return a - b;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
}

function compareVersions(a: string, b: string): number {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) return 0;
    const len = Math.max(pa.core.length, pb.core.length);
    for (let i = 0; i < len; i++) {
        const ai = pa.core[i] ?? 0;
        const bi = pb.core[i] ?? 0;
        if (ai !== bi) return ai - bi;
    }
    if (!pa.prerelease && !pb.prerelease) return 0;
    if (!pa.prerelease) return 1;
    if (!pb.prerelease) return -1;
    const plen = Math.max(pa.prerelease.length, pb.prerelease.length);
    for (let i = 0; i < plen; i++) {
        const ai = pa.prerelease[i];
        const bi = pb.prerelease[i];
        if (ai === undefined) return -1;
        if (bi === undefined) return 1;
        const cmp = compareIdentifiers(ai, bi);
        if (cmp !== 0) return cmp;
    }
    return 0;
}

@Injectable()
export class UpdatesService {
    private readonly logger = new Logger(UpdatesService.name);
    private readonly currentVersion: string;
    private latest: LatestReleaseEntity | null = null;
    private checkedAt: Date | null = null;
    private isFetching = false;
    private lastEtag: string | null = null;

    constructor(private readonly configService: ConfigService) {
        this.currentVersion = normalizeVersion(this.configService.get<string>("npm_package_version") || "");
    }

    getState(): UpdateStatusEntity {
        return new UpdateStatusEntity({
            updateAvailable: this.latest !== null,
            currentVersion: this.currentVersion || "unknown",
            latest: this.latest,
            checkedAt: this.checkedAt ? this.checkedAt.toISOString() : null,
        });
    }

    async refresh(): Promise<void> {
        if (this.isFetching) {
            this.logger.debug("Skipping update check: previous run still in progress");
            return;
        }
        if (!this.currentVersion) {
            this.logger.warn("Skipping update check: current version is unknown");
            return;
        }
        this.isFetching = true;
        try {
            const releases = await this.fetchReleases();
            if (releases === "not-modified") {
                this.checkedAt = new Date();
                this.logger.debug("Update check: 304 Not Modified");
                return;
            }
            const includePrerelease = isPrereleaseVersion(this.currentVersion);
            const candidates = releases
                .filter((r) => !r.draft && (!r.prerelease || includePrerelease))
                .sort((a, b) => compareVersions(b.tag_name, a.tag_name));

            const top = candidates[0];
            if (top && compareVersions(top.tag_name, this.currentVersion) > 0) {
                this.latest = new LatestReleaseEntity({
                    tagName: top.tag_name,
                    name: top.name,
                    htmlUrl: top.html_url,
                    publishedAt: top.published_at,
                });
                this.logger.log(`Update available: current=${this.currentVersion} latest=${top.tag_name}`);
            } else {
                this.latest = null;
                this.logger.debug(`Up to date: current=${this.currentVersion}`);
            }
            this.checkedAt = new Date();
        } catch (err) {
            this.logger.warn(
                `Update check failed, keeping previous state: ${err instanceof Error ? err.message : String(err)}`,
            );
        } finally {
            this.isFetching = false;
        }
    }

    private async fetchReleases(): Promise<GithubRelease[] | "not-modified"> {
        const headers: Record<string, string> = {
            Accept: "application/vnd.github+json",
            "User-Agent": `Flowy-Server/${this.currentVersion || "unknown"}`,
        };
        if (this.lastEtag) headers["If-None-Match"] = this.lastEtag;

        const response = await fetch(GITHUB_RELEASES_URL, {
            headers,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (response.status === 304) return "not-modified";
        if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
            const reset = response.headers.get("x-ratelimit-reset");
            throw new Error(`GitHub rate limit exceeded, resets at ${reset ?? "unknown"}`);
        }
        if (!response.ok) {
            throw new Error(`GitHub responded with ${response.status} ${response.statusText}`);
        }

        const etag = response.headers.get("etag");
        if (etag) this.lastEtag = etag;
        return (await response.json()) as GithubRelease[];
    }
}
