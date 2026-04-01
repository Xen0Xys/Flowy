/**
 * SSR-safe i18n translation helper for Pinia stores.
 * Falls back to the key itself when translation is unavailable.
 *
 * @param key - The i18n key to translate
 * @param params - Optional parameters for interpolation
 * @returns The translated string or the key itself if translation fails
 */
export const i18nT = (key: string, params?: Record<string, unknown>): string => {
    const i18n = useNuxtApp().$i18n;
    if (params) {
        return (i18n?.t(key, params) as string | undefined) ?? key;
    }
    return (i18n?.t(key) as string | undefined) ?? key;
};
