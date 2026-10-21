export default defineNuxtPlugin((nuxtApp) => {
    let startTime = performance.timeOrigin || Date.now();

    nuxtApp.hook("page:start", () => {
        startTime = Date.now();
    });

    nuxtApp.hook("page:finish", () => {
        const duration = Math.round(Date.now() - startTime);
        const route = useRouter().currentRoute.value;

        try {
            const data = JSON.stringify({
                // Path only: query strings and fragments may carry one-shot secrets.
                path: route.path,
                duration: duration,
            });

            // Use the Beacon API to send navigation data to the server without blocking the unload event
            const blob = new Blob([data], {type: "application/json"});
            navigator.sendBeacon("/api/log/nav", blob);
        } catch {
            // Silent if beacon API is not supported or if any error occurs
        }
    });
});
