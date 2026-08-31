import {copyFile, mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const README_SRC = path.resolve(ROOT, "..", "assets", "readme");
const SCREENSHOTS_DST = path.resolve(ROOT, "public", "screenshots");
const SHORTCUTS_DST = path.resolve(ROOT, "public", "shortcuts");
const ICONOIR_JSON = path.resolve(ROOT, "node_modules", "@iconify-json", "iconoir", "icons.json");

const BRAND = "#3b6cff";
const SHORTCUT_SIZE = 96;
const SHORTCUT_PADDING = 18;

type IconoirData = {
    icons: Record<string, {body: string; width?: number; height?: number}>;
    width?: number;
    height?: number;
};

const screenshots: Array<{src: string; dst: string}> = [
    {src: "flowy-hero.webp", dst: "dashboard.webp"},
    {src: "flowy-transactions.webp", dst: "transactions.webp"},
    {src: "flowy-budget.webp", dst: "budget.webp"},
];

const shortcuts: Array<{iconName: string; file: string}> = [
    {iconName: "home", file: "home-96.png"},
    {iconName: "credit-card", file: "transactions-96.png"},
    {iconName: "piggy-bank", file: "budget-96.png"},
];

const copyScreenshots = async (): Promise<void> => {
    await mkdir(SCREENSHOTS_DST, {recursive: true});
    const results = await Promise.all(
        screenshots.map(async ({src, dst}) => {
            const from = path.join(README_SRC, src);
            const to = path.join(SCREENSHOTS_DST, dst);
            await copyFile(from, to);
            const meta = await sharp(from).metadata();
            return `screenshot: ${dst} ${meta.width}x${meta.height}`;
        }),
    );
    for (const line of results) console.warn(line);
};

const renderShortcut = async (iconName: string, file: string, data: IconoirData): Promise<string> => {
    const icon = data.icons[iconName];
    if (!icon) {
        throw new Error(`iconoir icon "${iconName}" not found`);
    }
    const defaultW = data.width ?? 24;
    const defaultH = data.height ?? 24;
    const inner = SHORTCUT_SIZE - SHORTCUT_PADDING * 2;
    const w = icon.width ?? defaultW;
    const h = icon.height ?? defaultH;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}" viewBox="0 0 ${w} ${h}" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:#ffffff">${icon.body}</svg>`;
    const glyph = await sharp(Buffer.from(svg), {density: 384}).resize(inner, inner).png().toBuffer();
    const composed = await sharp({
        create: {width: SHORTCUT_SIZE, height: SHORTCUT_SIZE, channels: 4, background: BRAND},
    })
        .composite([{input: glyph, top: SHORTCUT_PADDING, left: SHORTCUT_PADDING}])
        .png()
        .toBuffer();
    await writeFile(path.join(SHORTCUTS_DST, file), composed);
    return `shortcut: ${file} (${iconName})`;
};

const renderShortcuts = async (): Promise<void> => {
    const raw = await readFile(ICONOIR_JSON, "utf8");
    const data = JSON.parse(raw) as IconoirData;
    await mkdir(SHORTCUTS_DST, {recursive: true});
    const results = await Promise.all(shortcuts.map(({iconName, file}) => renderShortcut(iconName, file, data)));
    for (const line of results) console.warn(line);
};

const main = async (): Promise<void> => {
    await copyScreenshots();
    await renderShortcuts();
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
