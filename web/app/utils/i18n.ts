/**
 * SSR-safe i18n translation helper for Pinia stores.
 * Caches the $i18n reference on first successful call so subsequent invocations
 * (typically inside store actions after an await) do not re-trigger useNuxtApp()
 * outside a valid Nuxt context.
 *
 * @param key - The i18n key to translate
 * @param params - Optional parameters for interpolation
 * @returns The translated string or the key itself if translation fails
 */
type I18nLike = {t: (key: string, params?: Record<string, unknown>) => unknown};

let cachedI18n: I18nLike | null = null;

function resolveI18n(): I18nLike | null {
    if (cachedI18n) return cachedI18n;
    try {
        const nuxt = useNuxtApp();
        const i18n = nuxt?.$i18n as I18nLike | undefined;
        if (i18n) cachedI18n = i18n;
        return cachedI18n;
    } catch {
        return null;
    }
}

export const i18nT = (key: string, params?: Record<string, unknown>): string => {
    const i18n = resolveI18n();
    if (params) {
        return (i18n?.t(key, params) as string | undefined) ?? key;
    }
    return (i18n?.t(key) as string | undefined) ?? key;
};
