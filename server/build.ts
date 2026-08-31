import {createSwaggerBunPlugin} from "./bun-plugins/swagger";

const isCompile: boolean = process.argv.includes("--compile");

// @ts-ignore
Bun.build({
    entrypoints: ["./src/app.ts"],
    format: "esm",
    outdir: "./dist",
    target: "bun",
    compile: isCompile ? {target: "bun-windows-x64-baseline", outfile: `${process.env.APP_NAME}.exe`} : false,
    plugins: [createSwaggerBunPlugin()],
    external: [
        "@nestjs/websockets",
        "@nestjs/websockets/*",
        "@nestjs/microservices",
        "@nestjs/microservices/*",
        "class-transformer/storage",
        "@fastify/view",
        "@nestjs/platform-express",
        "@nestjs/typeorm",
        "typeorm",
    ],
    minify: {
        whitespace: true,
        syntax: true,
    },
});
