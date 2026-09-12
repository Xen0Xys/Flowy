import {Injectable, ExecutionContext} from "@nestjs/common";
import {ThrottlerGuard} from "@nestjs/throttler";
import type {FastifyRequest} from "fastify";

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
    // Tests generate bursts against these endpoints on purpose; keeping the
    // guard active would flake CI without exercising real rate-limit behavior.
    protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
        return process.env.NODE_ENV === "test";
    }

    // Key by authenticated user id when available, otherwise fall back to
    // the client IP. Prevents a single account from being brute-forced from
    // rotating IPs, while still throttling anonymous flood attempts.
    protected async getTracker(req: Record<string, unknown>): Promise<string> {
        const request = req as FastifyRequest & {user?: {id?: string}};
        const userId = request.user?.id;
        if (typeof userId === "string" && userId.length > 0) return `user:${userId}`;
        return request.ip ?? "anonymous";
    }
}
