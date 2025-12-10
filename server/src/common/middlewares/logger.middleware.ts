import {Injectable, Logger, NestMiddleware} from "@nestjs/common";
import {FastifyReply, FastifyRequest} from "fastify";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    static logger: Logger = new Logger(LoggerMiddleware.name);

    use(
        req: FastifyRequest["raw"],
        res: FastifyReply["raw"],
        next: () => void,
    ) {
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
                LoggerMiddleware.logger.log(
                    `${protocol} ${method} ${path} ${statusCode} ${duration}ms ${intResSize}`,
                );
                LoggerMiddleware.logRequestTime(
                    path,
                    method || "N/A",
                    duration,
                );
            } catch (e) {
                LoggerMiddleware.logger.warn(`Can't log route ${path} : ${e}`);
            }
        });
        next();
    }

    static getProtocol(req: FastifyRequest["raw"]): string {
        const localPort: number = req.connection.localPort || 0;
        if (!localPort) return "H2";
        return localPort.toString() === process.env.HTTPS_PORT
            ? "HTTPS"
            : "HTTP";
    }

    static logRequestTime(
        path: string,
        method: string,
        duration: number,
    ): void {
        const thresholds: Record<string, number> = {
            GET: 750,
            POST: 1500,
            PUT: 1500,
            PATCH: 500,
            DELETE: 500,
        };
        const threshold = thresholds[method];
        if (threshold && duration > threshold) {
            LoggerMiddleware.logger.warn(
                `${method} (${path}) request exceeded ${threshold}ms (${duration}ms)`,
            );
        }
    }
}
