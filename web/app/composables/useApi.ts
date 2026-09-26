export function useApi() {
    // reactive cookie token (SSR-safe)
    const token = useCookie("flowy:token");

    // optional: read base URL from runtime config if defined
    const config = useRuntimeConfig?.() ?? null;
    const base = config?.public?.apiBase ?? "";

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

    async function apiFetch<T = any>(url: string, opts: any = {}) {
        const headers = {...opts.headers} as Record<string, string>;
        if (token?.value) headers.Authorization = `Bearer ${token.value}`;

        return await $fetch<T>(buildUrl(url), {
            ...opts,
            method: resolveMethod(opts),
            credentials: opts.credentials ?? "include",
            headers,
        });
    }

    return {apiFetch};
}
