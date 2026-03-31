export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook("nuxt-security:routeRules", (appSecurityOptions: Record<string, any>) => {
        if (process.env.NODE_ENV !== "production") return;
        const runtimeConfig = useRuntimeConfig();
        const apiBase = runtimeConfig.public?.apiBase;

        const connectSrc = ["'self'"];

        if (typeof apiBase === "string" && apiBase.trim().length > 0) {
            try {
                const url = new URL(apiBase.trim());
                const origin = url.origin;

                connectSrc.push(origin);

                // Add websocket equivalent for https origins
                if (url.protocol === "https:") connectSrc.push(origin.replace(/^https:/, "wss:"));
                else if (url.protocol === "http:") connectSrc.push(origin.replace(/^http:/, "ws:"));
            } catch {
                // Invalid URL - skip adding to CSP
            }
        }

        const globalRule = (appSecurityOptions["/**"] ??= {});
        const headers = (globalRule.headers ??= {});
        const csp = (headers.contentSecurityPolicy ??= {});

        csp["connect-src"] = connectSrc;
    });
});
