export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook("nuxt-security:routeRules", (appSecurityOptions: Record<string, any>) => {
        const runtimeConfig = useRuntimeConfig();
        const apiBase = runtimeConfig.public?.apiBase;

        const connectSrc = ["'self'"];

        if (typeof apiBase === "string" && apiBase.trim().length > 0) connectSrc.push(apiBase.trim());

        const globalRule = (appSecurityOptions["/**"] ??= {});
        const headers = (globalRule.headers ??= {});
        const csp = (headers.contentSecurityPolicy ??= {});

        csp["connect-src"] = connectSrc;
    });
});
