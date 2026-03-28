import {CanActivate, ExecutionContext, ForbiddenException, Injectable} from "@nestjs/common";
import type {FastifyReply, FastifyRequest} from "fastify";

@Injectable()
export class CsrfGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();

        const method = request.method.toUpperCase();
        const protectedMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
        if (!protectedMethods.has(method)) return true;

        const reply = context.switchToHttp().getResponse<FastifyReply>();
        const fastifyServer = request.server as FastifyRequest["server"] & {
            csrfProtection: (req: FastifyRequest, rep: FastifyReply, next: (error?: unknown) => void) => void;
        };

        await new Promise<void>((resolve, reject) => {
            fastifyServer.csrfProtection(request, reply, (error?: unknown) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        }).catch((error: {message?: string}) => {
            throw new ForbiddenException(error?.message ?? "Invalid CSRF token");
        });

        return true;
    }
}
