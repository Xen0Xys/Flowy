import {consola} from "consola";

const logger = consola.withTag("Router");

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody<{path: string; duration: number}>(event);
        if (!body || !body.path) return {success: false};

        const ip = getRequestIP(event, {xForwardedFor: true}) || "Unknown IP";
        const path = body.path;
        const duration = body.duration || 0;

        event.node.res.on("finish", () => {
            const statusCode = event.node.res.statusCode;
            const resSize = event.node.res.getHeader("content-length") || "0";

            // Format: HTTP NAV /path 200 15ms 16 - 127.0.0.1
            logger.log(`HTTP NAV ${path} ${statusCode} ${duration}ms ${resSize} - ${ip}`);
        });

        return {success: true};
    } catch {
        return {success: false};
    }
});
