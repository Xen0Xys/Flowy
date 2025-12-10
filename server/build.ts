// @ts-ignore
await Bun.build({
    entrypoints: ["./src/app.ts"],
    format: "esm",
    outdir: "./dist",
    target: "node",
    external: [
        "@nestjs/websockets/socket-module",
        "@nestjs/microservices",
        "class-transformer/storage",
        "@fastify/view",
        "@nestjs/platform-express",
    ],
    minify: {
        whitespace: true,
        syntax: true,
    },
});
