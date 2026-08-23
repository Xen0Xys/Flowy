import {computed, ref} from "vue";
import {useUserStore} from "~/stores/user.store";

export type GithubRelease = {
    tag_name: string;
    name: string;
    body: string;
    body_html?: string;
    body_html_safe?: string;
    html_url: string;
    published_at: string;
    draft: boolean;
    prerelease: boolean;
};

type CachedReleases = {
    fetchedAt: number;
    releases: GithubRelease[];
};

type PurifyLike = {
    sanitize: (html: string, options?: Record<string, unknown>) => string;
};

const GITHUB_REPO = "Xen0Xys/Flowy";
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const CACHE_KEY = "flowy:github-releases-cache";
const CACHE_TTL_MS = 4 * 60 * 1000;
const STORAGE_KEY_PREFIX = "flowy:last-seen-version:";

const open = ref(false);
const releases = ref<GithubRelease[]>([]);
const currentVersion = ref<string>("");

let purifierPromise: Promise<PurifyLike> | null = null;
async function getPurifier(): Promise<PurifyLike> {
    if (!purifierPromise) {
        purifierPromise = import("dompurify").then((mod) => mod.default as unknown as PurifyLike);
    }
    return purifierPromise;
}

function normalizeVersion(v: string): string {
    return v.trim().replace(/^v/i, "");
}

function parseVersion(v: string): number[] | null {
    const parts = normalizeVersion(v)
        .split(/[.-]/)
        .map((s) => parseInt(s, 10));
    if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return null;
    return parts;
}

function compareVersions(a: string, b: string): number {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) return 0;
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const ai = pa[i] ?? 0;
        const bi = pb[i] ?? 0;
        if (ai !== bi) return ai - bi;
    }
    return 0;
}

function isUnusableSrc(src: string): boolean {
    if (!src) return true;
    if (src.startsWith("./") || src.startsWith("../")) return true;
    if (src.startsWith("/") && !src.startsWith("//")) return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(src)) return true;
    return false;
}

function postProcessImages(html: string): string {
    if (typeof window === "undefined" || !html.includes("<img")) return html;
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const img of doc.querySelectorAll("img")) {
        const src = img.getAttribute("src") || "";
        if (isUnusableSrc(src)) {
            img.remove();
            continue;
        }
        img.setAttribute("loading", "lazy");
    }
    return doc.body.innerHTML;
}

export function useWhatsNew() {
    const config = useRuntimeConfig();
    const userStore = useUserStore();

    function getStorageKey(): string | null {
        const userId = userStore.user?.id;
        return userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;
    }

    function getLastSeen(): string | null {
        const key = getStorageKey();
        if (!key) return null;
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function setLastSeen(version: string): void {
        const key = getStorageKey();
        if (!key) return;
        try {
            localStorage.setItem(key, version);
        } catch {
            return;
        }
    }

    function getCache(): CachedReleases | null {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as CachedReleases;
            if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    function setCache(data: GithubRelease[]): void {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({fetchedAt: Date.now(), releases: data}));
        } catch {
            return;
        }
    }

    async function fetchReleases(): Promise<GithubRelease[]> {
        const cached = getCache();
        if (cached) return cached.releases;

        const data = await $fetch<GithubRelease[]>(GITHUB_RELEASES_URL, {
            credentials: "omit",
            headers: {
                Accept: "application/vnd.github.full+json",
            },
        });
        const list = (data ?? []).filter((r) => !r.draft && !r.prerelease);
        setCache(list);
        return list;
    }

    async function sanitizeReleases(list: GithubRelease[]): Promise<GithubRelease[]> {
        const purifier = await getPurifier();
        return list.map((r) => {
            if (!r.body_html || r.body_html_safe) return r;
            const sanitized = purifier.sanitize(r.body_html, {
                USE_PROFILES: {html: true},
                ADD_ATTR: ["target", "rel"],
            });
            return {
                ...r,
                body_html_safe: postProcessImages(sanitized),
            };
        });
    }

    async function check(): Promise<void> {
        if (!userStore.user?.id) return;

        const appVersion = normalizeVersion(String(config.public.appVersion || ""));
        if (!appVersion) return;

        currentVersion.value = appVersion;

        const lastSeenRaw = getLastSeen();
        if (!lastSeenRaw) {
            setLastSeen(appVersion);
            return;
        }

        const lastSeen = normalizeVersion(lastSeenRaw);
        if (compareVersions(lastSeen, appVersion) >= 0) return;

        let list: GithubRelease[] = [];
        try {
            list = await fetchReleases();
        } catch {
            return;
        }

        const relevant = list.filter((r) => {
            const tag = normalizeVersion(r.tag_name);
            return compareVersions(tag, lastSeen) > 0 && compareVersions(tag, appVersion) <= 0;
        });

        if (relevant.length === 0) return;

        relevant.sort((a, b) => compareVersions(b.tag_name, a.tag_name));

        let sanitized: GithubRelease[];
        try {
            sanitized = await sanitizeReleases(relevant);
        } catch {
            return;
        }

        releases.value = sanitized;
        open.value = true;
    }

    function markAsSeen(): void {
        if (currentVersion.value) setLastSeen(currentVersion.value);
        open.value = false;
        releases.value = [];
    }

    function close(): void {
        open.value = false;
    }

    return {
        open,
        releases: computed(() => releases.value),
        currentVersion: computed(() => currentVersion.value),
        check,
        markAsSeen,
        close,
    };
}
