import {Injectable, Logger, NestMiddleware} from "@nestjs/common";
import {FastifyReply, FastifyRequest} from "fastify";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    static logger: Logger = new Logger(LoggerMiddleware.name);

    private static getHeaderValue(value: string | string[] | undefined): string | undefined {
        if (!value) return undefined;
        return Array.isArray(value) ? value[0] : value;
    }

    static getClientIp(req: FastifyRequest): string {
        const xForwardedFor = LoggerMiddleware.getHeaderValue(req.headers["x-forwarded-for"]);
        const forwardedIp = xForwardedFor?.split(",")[0]?.trim();
        if (forwardedIp) {
            return forwardedIp;
        }

        const xRealIp = LoggerMiddleware.getHeaderValue(req.headers["x-real-ip"]);
        if (xRealIp?.trim()) {
            return xRealIp.trim();
        }

        const cfConnectingIp = LoggerMiddleware.getHeaderValue(req.headers["cf-connecting-ip"]);
        if (cfConnectingIp?.trim()) {
            return cfConnectingIp.trim();
        }

        const socketIp = req.raw?.socket?.remoteAddress;
        return req.ip || socketIp || "Unknown IP";
    }

    static getProtocol(req: FastifyRequest): string {
        return req.protocol.toUpperCase();
    }

    static logRequestTime(path: string, method: string, duration: number): void {
        const thresholds: Record<string, number> = {
            GET: 750,
            POST: 1500,
            PUT: 1500,
            PATCH: 500,
            DELETE: 500,
        };
        const threshold = thresholds[method];
        if (threshold && duration > threshold) {
            LoggerMiddleware.logger.warn(`${method} (${path}) request exceeded ${threshold}ms (${duration}ms)`);
        }
    }

    use(req: FastifyRequest, res: FastifyReply, next: () => void) {
        const startTime = Date.now();
        (res as any).on("finish", () => {
            const url = new URL(req.url || "", `http://${req.headers.host}`);
            const path: string = url.pathname;
            try {
                const protocol = LoggerMiddleware.getProtocol(req);
                const method = req.method;
                if (method === "OPTIONS") return;
                const statusCode = res.statusCode;
                const duration = Date.now() - startTime;
                const resSize: any = res.getHeader("Content-Length") || "0";
                const intResSize = parseInt(resSize);
                const ip = LoggerMiddleware.getClientIp(req);
                LoggerMiddleware.logger.log(
                    `${protocol} ${method} ${path} ${statusCode} ${duration}ms ${intResSize} - ${ip}`,
                );
                LoggerMiddleware.logRequestTime(path, method || "N/A", duration);
            } catch (e) {
                LoggerMiddleware.logger.warn(`Can't log route ${path} : ${e}`);
            }
        });
        next();
    }
}
