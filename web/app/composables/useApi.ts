export function useApi() {
    // reactive cookie token (SSR-safe)
    const token = useCookie("flowy:token");
    const csrfToken = useState<string | null>("csrf:token", () => null);
    const csrfRequestPending = useState<Promise<string> | null>("csrf:pending", () => null);

    // optional: read base URL from runtime config if defined
    const config = useRuntimeConfig?.() ?? null;
    const base = config?.public?.apiBase ?? "";

    const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

    function normalizeUrl(url: string): string {
        if (!url.startsWith("/")) return `/${url}`;
        return url;
    }

    function buildUrl(url: string): string {
        return `${base}${normalizeUrl(url)}`;
    }

    function resolveMethod(opts: any): string {
        const method = (opts?.method ?? "GET") as string;
        return method.toUpperCase();
    }

    async function fetchCsrfToken(forceRefresh = false): Promise<string> {
        if (!forceRefresh && csrfToken.value) return csrfToken.value;
        if (!forceRefresh && csrfRequestPending.value) return csrfRequestPending.value;

        const requestPromise = $fetch<{csrfToken: string}>(buildUrl("/auth/csrf"), {
            method: "GET",
            credentials: "include",
        }).then((response) => {
            if (!response?.csrfToken) {
                throw new Error("CSRF token missing from server response");
            }

            csrfToken.value = response.csrfToken;
            return response.csrfToken;
        });

        csrfRequestPending.value = requestPromise;

        try {
            return await requestPromise;
        } finally {
            csrfRequestPending.value = null;
        }
    }

    function isCsrfFailure(error: any): boolean {
        const statusCode = error?.status ?? error?.response?.status ?? error?.statusCode;
        return statusCode === 403;
    }

    async function apiFetch<T = any>(url: string, opts: any = {}) {
        const method = resolveMethod(opts);
        const requiresCsrf = MUTATING_METHODS.has(method);

        const headers = {...opts.headers} as Record<string, string>;
        if (token?.value) headers.Authorization = `Bearer ${token.value}`;

        if (requiresCsrf) {
            headers["x-csrf-token"] = await fetchCsrfToken();
        }

        const finalUrl = buildUrl(url);

        try {
            return await $fetch<T>(finalUrl, {
                ...opts,
                method,
                credentials: opts.credentials ?? "include",
                headers,
            });
        } catch (error: any) {
            if (!requiresCsrf || !isCsrfFailure(error)) {
                throw error;
            }

            headers["x-csrf-token"] = await fetchCsrfToken(true);

            return await $fetch<T>(finalUrl, {
                ...opts,
                method,
                credentials: opts.credentials ?? "include",
                headers,
            });
        }
    }

    return {apiFetch};
}
