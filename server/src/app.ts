import {FastifyAdapter, NestFastifyApplication} from "@nestjs/platform-fastify";
import {CustomValidationPipe} from "./common/pipes/validation.pipe";
import {LoggerMiddleware} from "./common/middlewares/logger.middleware";
import {SwaggerTheme, SwaggerThemeNameEnum} from "swagger-themes";
import {DocumentBuilder, SwaggerModule} from "@nestjs/swagger";
import {FastifyListenOptions} from "fastify/types/instance";
import {NestFactory} from "@nestjs/core";
import {AppModule} from "./app.module";
import {Logger} from "@nestjs/common";
import * as fs from "fs";
import path from "path";

const logger: Logger = new Logger("App");

const pkgJsonPath = path.resolve(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

const port: number = process.env.PORT ? parseInt(process.env.PORT) : 4000;

async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({exposeHeadRoutes: true}),
        {cookies: {secret: process.env.APP_SECRET}},
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

    server.useSecurityHeaders({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", `'unsafe-inline'`],
                imgSrc: ["'self'", "data:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'none'"],
                frameSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
        strictTransportSecurity: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
        referrerPolicy: {policy: "strict-origin-when-cross-origin"},
        xPermittedCrossDomainPolicies: false,
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: {policy: "same-origin"},
        crossOriginResourcePolicy: {policy: "same-origin"},
    });

    server.enableCsrfProtection({trustedOrigins: corsOrigins});

    server.enableCors({
        origin: corsOrigins,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    });

    // Middlewares
    server.use(new LoggerMiddleware().use);

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

bootstrap().catch((err) => {
    console.error("Fatal bootstrap error:", err);
    process.exit(1);
});
