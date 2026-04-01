import {readdir, readFile} from "node:fs/promises";
import path from "node:path";

type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};

const LOCALES_DIR = path.resolve(process.cwd(), "i18n", "locales");
const SOURCE_DIR = path.resolve(process.cwd(), "app");

const TRANSLATION_CALL_PATTERN = /(?:\$t|\bt|i18nT)\(\s*(["'`])([^"'`]+)\1/g;

type UsageCollection = {
    staticKeys: Set<string>;
    dynamicPrefixes: Set<string>;
};

const flattenLocaleKeys = (value: JsonValue, prefix = ""): string[] => {
    if (value === null || Array.isArray(value) || typeof value !== "object") {
        return prefix ? [prefix] : [];
    }

    const record = value as {[key: string]: JsonValue};
    const keys: string[] = [];

    for (const [key, nestedValue] of Object.entries(record)) {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        const nestedKeys = flattenLocaleKeys(nestedValue, nextPrefix);

        if (nestedKeys.length === 0) {
            keys.push(nextPrefix);
            continue;
        }

        keys.push(...nestedKeys);
    }

    return keys;
};

const getAllFiles = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, {withFileTypes: true});
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...(await getAllFiles(fullPath)));
            continue;
        }

        files.push(fullPath);
    }

    return files;
};

const normalizeDynamicPrefix = (key: string): string => {
    const beforeInterpolation = key.split("${")[0] ?? "";
    return beforeInterpolation.replace(/\.+$/, "").trim();
};

const collectUsedKeys = async (): Promise<UsageCollection> => {
    const files = await getAllFiles(SOURCE_DIR);
    const sourceFiles = files.filter((filePath) => /\.(vue|ts|js)$/.test(filePath));
    const staticKeys = new Set<string>();
    const dynamicPrefixes = new Set<string>();

    for (const filePath of sourceFiles) {
        const content = await readFile(filePath, "utf8");
        const matches = content.matchAll(TRANSLATION_CALL_PATTERN);

        for (const match of matches) {
            const key = match[2]?.trim();
            if (!key) {
                continue;
            }

            if (key.includes("${")) {
                const prefix = normalizeDynamicPrefix(key);
                if (prefix) {
                    dynamicPrefixes.add(prefix);
                }
                continue;
            }

            staticKeys.add(key);
        }
    }

    return {staticKeys, dynamicPrefixes};
};

const readLocaleFiles = async (): Promise<Map<string, Set<string>>> => {
    const entries = await readdir(LOCALES_DIR, {withFileTypes: true});
    const localeFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    const locales = new Map<string, Set<string>>();

    for (const localeFile of localeFiles) {
        const localePath = path.join(LOCALES_DIR, localeFile.name);
        const rawContent = await readFile(localePath, "utf8");
        const parsed = JSON.parse(rawContent) as JsonValue;
        const localeCode = path.parse(localeFile.name).name;
        const flatKeys = flattenLocaleKeys(parsed);

        locales.set(localeCode, new Set(flatKeys));
    }

    return locales;
};

const logKeyList = (title: string, keys: string[]): void => {
    console.error(`\n${title} (${keys.length})`);
    for (const key of keys) {
        console.error(`- ${key}`);
    }
};

const isCoveredByDynamicPrefix = (key: string, dynamicPrefixes: Set<string>): boolean => {
    for (const prefix of dynamicPrefixes) {
        if (key === prefix || key.startsWith(`${prefix}.`)) {
            return true;
        }
    }

    return false;
};

const main = async (): Promise<void> => {
    const locales = await readLocaleFiles();

    if (locales.size === 0) {
        console.error("No locale files found in i18n/locales.");
        process.exit(1);
    }

    const {staticKeys, dynamicPrefixes} = await collectUsedKeys();
    const localeEntries = [...locales.entries()];
    const baseLocaleEntry = localeEntries[0];

    if (!baseLocaleEntry) {
        console.error("No base locale entry found.");
        process.exit(1);
    }

    const [baseLocaleCode, baseLocaleKeys] = baseLocaleEntry;

    const missingInLocales: string[] = [];
    for (const usedKey of staticKeys) {
        for (const [localeCode, localeKeys] of localeEntries) {
            if (!localeKeys.has(usedKey)) {
                missingInLocales.push(`${usedKey} (missing in ${localeCode})`);
            }
        }
    }

    const invalidDynamicPrefixes: string[] = [];
    for (const prefix of dynamicPrefixes) {
        for (const [localeCode, localeKeys] of localeEntries) {
            const isKnownPrefix = [...localeKeys].some((key) => key === prefix || key.startsWith(`${prefix}.`));
            if (!isKnownPrefix) {
                invalidDynamicPrefixes.push(`${prefix} (unknown in ${localeCode})`);
            }
        }
    }

    const unusedKeys = [...baseLocaleKeys].filter(
        (key) => !staticKeys.has(key) && !isCoveredByDynamicPrefix(key, dynamicPrefixes),
    );
    const keysMissingFromBase = [...staticKeys].filter((key) => !baseLocaleKeys.has(key));

    if (keysMissingFromBase.length > 0) {
        logKeyList(`Keys used in code but missing in base locale (${baseLocaleCode})`, keysMissingFromBase.sort());
    }

    if (missingInLocales.length > 0) {
        logKeyList("Keys missing in locale files", missingInLocales.sort());
    }

    if (invalidDynamicPrefixes.length > 0) {
        logKeyList("Dynamic key prefixes not found in locale files", invalidDynamicPrefixes.sort());
    }

    if (unusedKeys.length > 0) {
        logKeyList(`Unused keys in base locale (${baseLocaleCode})`, unusedKeys.sort());
    }

    if (dynamicPrefixes.size > 0) {
        console.log(
            `Detected ${dynamicPrefixes.size} dynamic i18n key prefix(es): ${[...dynamicPrefixes].sort().join(", ")}`,
        );
    }

    if (
        keysMissingFromBase.length > 0 ||
        missingInLocales.length > 0 ||
        invalidDynamicPrefixes.length > 0 ||
        unusedKeys.length > 0
    ) {
        process.exit(1);
    }

    console.log(
        `I18n check passed. ${staticKeys.size} static used keys found across ${localeEntries.length} locale files.`,
    );
};

await main();
