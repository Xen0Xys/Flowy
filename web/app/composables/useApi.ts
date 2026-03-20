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
        if (!url.startsWith("/")) url = `/${url}`;
        const finalUrl = `${base}${url}`;

        return $fetch<T>(finalUrl, {...opts, headers});
    }

    return {apiFetch};
}
