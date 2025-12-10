// prettier.config.js, .prettierrc.js, prettier.config.mjs, or .prettierrc.mjs

/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
export default {
    plugins: ["@prettier/plugin-oxc", "prettier-plugin-tailwindcss"],
    trailingComma: "all",
    tabWidth: 4,
    semi: true,
    singleQuote: false,
    bracketSpacing: false,
    bracketSameLine: true,
    arrowParens: "always",
    endOfLine: "auto",
    objectWrap: "preserve",
};
