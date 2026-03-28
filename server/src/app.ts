import {FastifyAdapter, NestFastifyApplication} from "@nestjs/platform-fastify";
import {CustomValidationPipe} from "./common/pipes/validation.pipe";
import {LoggerMiddleware} from "./common/middlewares/logger.middleware";
import {SwaggerTheme, SwaggerThemeNameEnum} from "swagger-themes";
import {DocumentBuilder, SwaggerModule} from "@nestjs/swagger";
import fastifyCsrfProtection from "@fastify/csrf-protection";
import fastifyCookie from "@fastify/cookie";
import {FastifyListenOptions} from "fastify/types/instance";
import fastifyMultipart from "@fastify/multipart";
import fastifyHelmet from "@fastify/helmet";
import {NestFactory} from "@nestjs/core";
import {AppModule} from "./app.module";
import {Logger} from "@nestjs/common";
import * as fs from "fs";
import path from "path";

const logger: Logger = new Logger("App");

const pkgJsonPath = path.resolve(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

process.env.APP_NAME = process.env.npm_package_name
    ?.split("-")
    .map((word: string): string => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
const port: number = process.env.PORT ? parseInt(process.env.PORT) : 4000;

async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({exposeHeadRoutes: true}),
    );
    await loadServer(app);

    await app.listen({
        port: port,
        host: "0.0.0.0",
    } as FastifyListenOptions);
    app.enableShutdownHooks();
    logger.log(`Listening on http://0.0.0.0:${port}`);
    logger.log(`API Documentation available at http://localhost:${port}/api`);
}

export async function loadServer(server: NestFastifyApplication) {
    // Config
    server.setGlobalPrefix(process.env.PREFIX || "");

    const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    server.enableCors({
        origin: corsOrigins,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
    });

    // Middlewares
    server.use(new LoggerMiddleware().use);
    await server.register(fastifyCookie as any);
    await server.register(fastifyCsrfProtection as any, {
        getToken: (request: {headers: Record<string, string | string[] | undefined>}): string | undefined => {
            const header = request.headers["x-csrf-token"];
            if (!header) return undefined;
            return Array.isArray(header) ? header[0] : header;
        },
        cookieOpts: {
            path: "/",
            sameSite: "lax",
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
        },
    });

    await server.register(fastifyMultipart as any, {
        limits: {
            fileSize: 500 * 1024 * 1024, // 500MB
        },
    });
    await server.register(
        fastifyHelmet as any,
        {
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false,
            crossOriginOpenerPolicy: false,
            crossOriginResourcePolicy: false,
        } as any,
    );

    // Swagger
    const config = new DocumentBuilder()
        .setTitle(process.env.APP_NAME || "NestJS Application")
        .setDescription(`Documentation for ${process.env.APP_NAME}`)
        .setVersion(pkg.version)
        .addBearerAuth()
        .build();

    const document = SwaggerModule.createDocument(server, config);
    const theme = new SwaggerTheme();
    const customCss = theme.getBuffer(SwaggerThemeNameEnum.DARK);
    SwaggerModule.setup("api", server, document, {
        swaggerOptions: {
            filter: true,
            displayRequestDuration: true,
            persistAuthorization: true,
            docExpansion: "none",
            tagsSorter: "alpha",
            operationsSorter: "method",
        },
        customCss,
    });

    server.useGlobalPipes(new CustomValidationPipe());
}

if (require.main === module) {
    bootstrap();
}
