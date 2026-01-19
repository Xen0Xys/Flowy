export function useApi() {
    // reactive cookie token (SSR-safe)
    const token = useCookie("flowy:token");

    // optional: read base URL from runtime config if defined
    const config = useRuntimeConfig?.() ?? null;
    const base = config?.public?.apiBase ?? "";

    async function apiFetch<T = any>(url: string, opts: any = {}) {
        const headers = {...opts.headers} as Record<string, string>;
        if (token?.value) headers.Authorization = `Bearer ${token.value}`;

        // ensure URL uses base if provided and not absolute
        const finalUrl =
            url.startsWith("http") || url.startsWith("/")
                ? `${base}${url}`.replace(/\/\//g, "/")
                : `${base}/${url}`;

        return $fetch<T>(finalUrl, {...opts, headers});
    }

    return {apiFetch};
}
