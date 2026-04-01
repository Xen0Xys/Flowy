import {consola} from "consola";

const logger = consola.withTag("Router");

const MAX_PATH_LENGTH = 1024;
const MAX_DURATION_MS = 86_400_000; // 24 hours in milliseconds

function sanitizeForLog(value: string, maxLength = MAX_PATH_LENGTH): string {
    const sanitized = value
        .replace(/[\r\n]/g, "") // Strip newlines to prevent log injection
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F]/g, ""); // Strip control characters
    return sanitized.slice(0, maxLength);
}

function coerceDuration(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.min(num, MAX_DURATION_MS);
}

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody<{path: string; duration: number}>(event);
        if (!body || !body.path) return {success: false};

        const rawIp = getRequestIP(event, {xForwardedFor: true}) || "Unknown IP";
        const ip = sanitizeForLog(rawIp, 45); // Max IPv6 length is 45 chars
        const path = sanitizeForLog(body.path);
        const duration = coerceDuration(body.duration);

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
