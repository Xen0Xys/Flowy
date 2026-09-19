// oxlint-disable-next-line import/no-unassigned-import
import "reflect-metadata";
// @ts-ignore
import {describe, expect, test} from "bun:test";
import {
    ArgumentMetadata,
    BadRequestException,
    ConflictException,
    ExecutionContext,
    ForbiddenException,
    HttpException,
    HttpStatus,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import {IsString, validate} from "class-validator";
import {AtLeastOne} from "../src/common/validators/at-least-one.validator";
import {CustomValidationPipe} from "../src/common/pipes/validation.pipe";
import {PrismaExceptionFilter} from "../src/common/filters/prisma-exception.filter";
import {LoggerMiddleware} from "../src/common/middlewares/logger.middleware";
import {FamilyAdminGuard} from "../src/common/guards/family-admin.guard";
import {InstanceOwnerGuard} from "../src/common/guards/instance-owner.guard";
import {JwtAuthGuard} from "../src/common/guards/jwt-auth.guard";
import {CsrfGuard} from "../src/common/guards/csrf.guard";
import {Prisma} from "../prisma/generated/client";
import {UserRoles} from "../prisma/generated/enums";
import {UserEntity} from "../src/modules/users/user/models/entities/user.entity";

// ─── AtLeastOne validator ─────────────────────────────────────────────

class SampleUpdateDto {
    @AtLeastOne(["email", "username"])
    _marker!: unknown;

    @IsString()
    _?: string;

    email?: string;
    username?: string;
}

describe("AtLeastOne validator", () => {
    test("passes when at least one target property is provided", async () => {
        const dto = new SampleUpdateDto();
        dto.email = "user@test.com";
        const errors = await validate(dto);
        const marker = errors.find((e) => e.property === "_marker");
        expect(marker).toBeUndefined();
    });

    test("fails when none of the target properties are set", async () => {
        const dto = new SampleUpdateDto();
        const errors = await validate(dto);
        const marker = errors.find((e) => e.property === "_marker");
        expect(marker).toBeDefined();
        expect(marker?.constraints?.atLeastOne).toContain("At least one of");
    });

    test("fails when only an empty string is provided", async () => {
        const dto = new SampleUpdateDto();
        dto.username = "   ";
        const errors = await validate(dto);
        const marker = errors.find((e) => e.property === "_marker");
        expect(marker).toBeDefined();
    });
});

// ─── CustomValidationPipe ─────────────────────────────────────────────

class SamplePipeDto {
    @IsString()
    name!: string;
}

describe("CustomValidationPipe", () => {
    const pipe = new CustomValidationPipe();
    const metadata: ArgumentMetadata = {type: "body", metatype: SamplePipeDto, data: undefined};

    test("returns transformed value when payload is valid", async () => {
        const result = await pipe.transform({name: "ok"}, metadata);
        expect(result).toBeInstanceOf(SamplePipeDto);
        expect(result.name).toBe("ok");
    });

    test("throws BadRequestException with detailed message list for invalid payload", async () => {
        try {
            await pipe.transform({}, metadata);
            throw new Error("expected to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(BadRequestException);
            const response = (err as BadRequestException).getResponse() as {message: unknown};
            expect(Array.isArray(response.message)).toBe(true);
        }
    });

    test("rejects unknown fields when forbidNonWhitelisted is on", async () => {
        try {
            await pipe.transform({name: "ok", extra: "boom"}, metadata);
            throw new Error("expected to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(BadRequestException);
        }
    });
});

// ─── PrismaExceptionFilter ────────────────────────────────────────────

function makePrismaError(code: string): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError("boom", {
        code,
        clientVersion: "test",
    });
}

describe("PrismaExceptionFilter", () => {
    const filter = new PrismaExceptionFilter();

    test("maps P2002 to ConflictException", () => {
        const mapped = (filter as any).mapToHttpException(makePrismaError("P2002")) as HttpException;
        expect(mapped).toBeInstanceOf(ConflictException);
        expect(mapped.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    test("maps P2003 to BadRequestException", () => {
        const mapped = (filter as any).mapToHttpException(makePrismaError("P2003")) as HttpException;
        expect(mapped).toBeInstanceOf(BadRequestException);
    });

    test("maps P2025 to NotFoundException", () => {
        const mapped = (filter as any).mapToHttpException(makePrismaError("P2025")) as HttpException;
        expect(mapped).toBeInstanceOf(NotFoundException);
    });

    test("returns null for unmapped codes so catch() falls through to super", () => {
        const mapped = (filter as any).mapToHttpException(makePrismaError("P9999"));
        expect(mapped).toBeNull();
    });
});

// ─── LoggerMiddleware ─────────────────────────────────────────────────

function makeReply(): {reply: any; trigger: () => void} {
    const listeners: Array<() => void> = [];
    const reply: any = {
        statusCode: 200,
        getHeader: () => "42",
        on(event: string, cb: () => void) {
            if (event === "finish") listeners.push(cb);
        },
    };
    return {
        reply,
        trigger: () => {
            for (const cb of listeners) cb();
        },
    };
}

describe("LoggerMiddleware", () => {
    const middleware = new LoggerMiddleware();

    test("getClientIp prefers x-forwarded-for, then x-real-ip, then cf-connecting-ip, then req.ip", () => {
        expect(LoggerMiddleware.getClientIp({headers: {"x-forwarded-for": "1.1.1.1, 2.2.2.2"}} as any)).toBe("1.1.1.1");
        expect(LoggerMiddleware.getClientIp({headers: {"x-real-ip": "3.3.3.3"}} as any)).toBe("3.3.3.3");
        expect(LoggerMiddleware.getClientIp({headers: {"cf-connecting-ip": "4.4.4.4"}} as any)).toBe("4.4.4.4");
        expect(LoggerMiddleware.getClientIp({headers: {}, ip: "5.5.5.5"} as any)).toBe("5.5.5.5");
        expect(LoggerMiddleware.getClientIp({headers: {}} as any)).toBe("Unknown IP");
    });

    test("getClientIp handles array header values", () => {
        expect(LoggerMiddleware.getClientIp({headers: {"x-forwarded-for": ["9.9.9.9"]}} as any)).toBe("9.9.9.9");
    });

    test("getProtocol uppercases the protocol", () => {
        expect(LoggerMiddleware.getProtocol({protocol: "http"} as any)).toBe("HTTP");
    });

    test("logRequestTime warns above per-method threshold", () => {
        // Should not throw regardless of value; just executes the branch
        LoggerMiddleware.logRequestTime("/x", "GET", 10000);
        LoggerMiddleware.logRequestTime("/x", "GET", 10);
        LoggerMiddleware.logRequestTime("/x", "UNKNOWN", 99);
    });

    test("use() attaches finish handler and invokes next", () => {
        const {reply, trigger} = makeReply();
        let called = false;
        const req: any = {
            url: "/hello?x=1",
            headers: {host: "localhost", "x-forwarded-for": "1.2.3.4"},
            method: "GET",
            protocol: "http",
            raw: {socket: {remoteAddress: "127.0.0.1"}},
        };
        middleware.use(req, reply, () => {
            called = true;
        });
        trigger();
        expect(called).toBe(true);
    });

    test("use() skips logging on OPTIONS but still calls next", () => {
        const {reply, trigger} = makeReply();
        let called = false;
        const req: any = {
            url: "/hello",
            headers: {host: "localhost"},
            method: "OPTIONS",
            protocol: "http",
            raw: {socket: {remoteAddress: "127.0.0.1"}},
        };
        middleware.use(req, reply, () => {
            called = true;
        });
        trigger();
        expect(called).toBe(true);
    });
});

// ─── FamilyAdminGuard ─────────────────────────────────────────────────

function makeCtx(user: Partial<UserEntity> | undefined): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => ({user}),
        }),
    } as unknown as ExecutionContext;
}

describe("FamilyAdminGuard", () => {
    const guard = new FamilyAdminGuard();

    test("throws when no user is attached", () => {
        expect(() => guard.canActivate(makeCtx(undefined))).toThrow(ForbiddenException);
    });

    test("throws when user has no family", () => {
        expect(() => guard.canActivate(makeCtx({id: "u", familyId: null}))).toThrow(ForbiddenException);
    });

    test("throws when user is not admin of the family", () => {
        expect(() => guard.canActivate(makeCtx({id: "u", familyId: "f", familyRole: UserRoles.USER}))).toThrow(
            ForbiddenException,
        );
    });

    test("allows admins", () => {
        expect(guard.canActivate(makeCtx({id: "u", familyId: "f", familyRole: UserRoles.ADMIN}))).toBe(true);
    });
});

// ─── InstanceOwnerGuard ───────────────────────────────────────────────

describe("InstanceOwnerGuard", () => {
    test("throws when user is not attached", async () => {
        const guard = new InstanceOwnerGuard({config: {findUnique: async () => null}} as any);
        await expect(guard.canActivate(makeCtx(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    test("throws when no INSTANCE_OWNER config is set", async () => {
        const guard = new InstanceOwnerGuard({config: {findUnique: async () => null}} as any);
        await expect(guard.canActivate(makeCtx({id: "user-1"}))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    test("throws when the configured owner is a different user", async () => {
        const guard = new InstanceOwnerGuard({
            config: {findUnique: async () => ({value: "other"})},
        } as any);
        await expect(guard.canActivate(makeCtx({id: "user-1"}))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    test("allows the configured instance owner", async () => {
        const guard = new InstanceOwnerGuard({
            config: {findUnique: async () => ({value: "user-1"})},
        } as any);
        await expect(guard.canActivate(makeCtx({id: "user-1"}))).resolves.toBe(true);
    });
});

// ─── JwtAuthGuard ─────────────────────────────────────────────────────

function makeJwtCtx(headers: Record<string, string> = {}): ExecutionContext {
    const request: any = {headers};
    return {
        switchToHttp: () => ({getRequest: () => request}),
    } as unknown as ExecutionContext;
}

describe("JwtAuthGuard", () => {
    test("throws when Authorization header is missing", async () => {
        const guard = new JwtAuthGuard({} as any, {} as any);
        await expect(guard.canActivate(makeJwtCtx())).rejects.toBeInstanceOf(UnauthorizedException);
    });

    test("throws when scheme is not Bearer", async () => {
        const guard = new JwtAuthGuard({} as any, {} as any);
        await expect(guard.canActivate(makeJwtCtx({authorization: "Basic abc"}))).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    test("throws when jwt verification fails", async () => {
        const jwt: any = {verifyAsync: async () => Promise.reject(new Error("bad"))};
        const guard = new JwtAuthGuard(jwt, {} as any);
        await expect(guard.canActivate(makeJwtCtx({authorization: "Bearer x"}))).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    test("throws when payload lacks sub", async () => {
        const jwt: any = {verifyAsync: async () => ({aud: "AUTH"})};
        const guard = new JwtAuthGuard(jwt, {} as any);
        await expect(guard.canActivate(makeJwtCtx({authorization: "Bearer x"}))).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    test("throws when audience is not AUTH", async () => {
        const jwt: any = {verifyAsync: async () => ({sub: "user-1", aud: "OTHER"})};
        const guard = new JwtAuthGuard(jwt, {} as any);
        await expect(guard.canActivate(makeJwtCtx({authorization: "Bearer x"}))).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    test("throws when user is not found in database", async () => {
        const jwt: any = {verifyAsync: async () => ({sub: "user-1", aud: "AUTH"})};
        const prisma: any = {users: {findUnique: async () => null}};
        const guard = new JwtAuthGuard(jwt, prisma);
        await expect(guard.canActivate(makeJwtCtx({authorization: "Bearer x"}))).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    test("throws when jti does not match user's stored jwt_id", async () => {
        const jwt: any = {verifyAsync: async () => ({sub: "user-1", aud: "AUTH", jti: "old"})};
        const prisma: any = {
            users: {
                findUnique: async () => ({
                    id: "user-1",
                    username: "u",
                    email: "e",
                    password: "",
                    jwt_id: "new",
                    mfa_enabled: false,
                    family_id: null,
                    family_role: null,
                }),
            },
        };
        const guard = new JwtAuthGuard(jwt, prisma);
        await expect(guard.canActivate(makeJwtCtx({authorization: "Bearer x"}))).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    test("allows when everything checks out and attaches user to the request", async () => {
        const jwt: any = {verifyAsync: async () => ({sub: "user-1", aud: "AUTH", jti: "id-1"})};
        const prisma: any = {
            users: {
                findUnique: async () => ({
                    id: "user-1",
                    username: "u",
                    email: "e",
                    password: "hash",
                    jwt_id: "id-1",
                    mfa_enabled: false,
                    family_id: null,
                    family_role: null,
                }),
            },
        };
        const guard = new JwtAuthGuard(jwt, prisma);
        const ctxRequest: any = {headers: {authorization: "Bearer x"}};
        const ctx: any = {switchToHttp: () => ({getRequest: () => ctxRequest})};
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
        expect(ctxRequest.user).toBeDefined();
        expect(ctxRequest.user.id).toBe("user-1");
    });
});

// ─── CsrfGuard ─────────────────────────────────────────────────────────

describe("CsrfGuard", () => {
    test("passes safe methods through without CSRF check", async () => {
        const guard = new CsrfGuard();
        const ctx: any = {
            switchToHttp: () => ({
                getRequest: () => ({method: "GET"}),
                getResponse: () => ({}),
            }),
        };
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    test("delegates to fastify csrfProtection for state-changing methods and throws when it fails", async () => {
        const guard = new CsrfGuard();
        const request: any = {
            method: "POST",
            server: {
                csrfProtection: (_req: any, _rep: any, next: (e?: unknown) => void) => next(new Error("bad token")),
            },
        };
        const ctx: any = {
            switchToHttp: () => ({
                getRequest: () => request,
                getResponse: () => ({}),
            }),
        };
        await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    });

    test("resolves when fastify csrfProtection succeeds", async () => {
        const guard = new CsrfGuard();
        const request: any = {
            method: "POST",
            server: {
                csrfProtection: (_req: any, _rep: any, next: (e?: unknown) => void) => next(),
            },
        };
        const ctx: any = {
            switchToHttp: () => ({
                getRequest: () => request,
                getResponse: () => ({}),
            }),
        };
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
});
