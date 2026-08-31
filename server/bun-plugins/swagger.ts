import type {BunPlugin} from "bun";
import {before as swaggerBefore} from "@nestjs/swagger/plugin";
import ts from "typescript";
import * as nodePath from "path";
import * as fs from "fs";

function loadSwaggerOptionsFromNestCli(cwd: string): Record<string, any> {
    const nestCliPath = nodePath.resolve(cwd, "nest-cli.json");
    if (!fs.existsSync(nestCliPath)) return {};

    const nestCli = JSON.parse(fs.readFileSync(nestCliPath, "utf-8"));
    const plugins = nestCli?.compilerOptions?.plugins ?? [];

    for (const entry of plugins) {
        const name = typeof entry === "string" ? entry : entry?.name;
        if (name === "@nestjs/swagger" || name === "@nestjs/swagger/plugin") {
            return typeof entry === "string" ? {} : (entry.options ?? {});
        }
    }
    return {};
}

export function createSwaggerBunPlugin(): BunPlugin {
    const cwd = process.cwd();
    const tsconfigPath = nodePath.resolve(cwd, "tsconfig.json");
    const configText = fs.readFileSync(tsconfigPath, "utf-8");
    const parsed = ts.parseConfigFileTextToJson(tsconfigPath, configText);
    if (parsed.error) {
        throw new Error(
            "Failed to parse tsconfig.json: " + ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"),
        );
    }
    const config = ts.parseJsonConfigFileContent(parsed.config, ts.sys, cwd);

    const program = ts.createProgram({
        rootNames: config.fileNames,
        options: config.options,
    });

    const transformer = swaggerBefore(loadSwaggerOptionsFromNestCli(cwd), program);

    const printer = ts.createPrinter();

    return {
        name: "nestjs-swagger",
        setup(build) {
            build.onLoad({filter: /\.ts$/}, ({path: filePath}) => {
                if (filePath.endsWith(".d.ts")) return undefined;
                if (filePath.includes("node_modules")) return undefined;

                const absPath = nodePath.resolve(filePath);
                const sourceFile = program.getSourceFile(absPath);
                if (!sourceFile) return undefined;

                const result = ts.transform(sourceFile, [transformer]);
                const transformedSrc = result.transformed[0] as ts.SourceFile;
                const contents = printer.printFile(transformedSrc);
                result.dispose();

                return {contents, loader: "ts"};
            });
        },
    };
}
