const CURRENCY_LOCALES_MAP: Record<string, {default: string; valid: string[]}> = {
    EUR: {
        default: "fr-FR",
        valid: [
            "fr-FR",
            "de-DE",
            "es-ES",
            "it-IT",
            "pt-PT",
            "nl-NL",
            "el-GR",
            "fi-FI",
            "sv-FI",
            "et-EE",
            "lv-LV",
            "lt-LT",
            "sk-SK",
            "sl-SI",
            "mt-MT",
            "cy-CY",
            "lb-LU",
            "fr-LU",
            "de-AT",
            "fr-BE",
            "nl-BE",
            "de-BE",
            "fr-MC",
            "it-SM",
            "it-VA",
            "pt-AD",
        ],
    },
    USD: {
        default: "en-US",
        valid: [
            "en-US",
            "en-AS",
            "en-GU",
            "en-MH",
            "en-MP",
            "en-PR",
            "en-TC",
            "en-VI",
            "en-EC",
            "es-EC",
            "en-SV",
            "es-SV",
            "en-PW",
            "en-FM",
        ],
    },
    GBP: {
        default: "en-GB",
        valid: ["en-GB", "en-GG", "en-JE", "en-IM", "en-GI", "en-FK", "en-SH"],
    },
    JPY: {
        default: "ja-JP",
        valid: ["ja-JP"],
    },
    CHF: {
        default: "de-CH",
        valid: ["de-CH", "fr-CH", "it-CH", "rm-CH", "de-LI"],
    },
    CAD: {
        default: "en-CA",
        valid: ["en-CA", "fr-CA"],
    },
    AUD: {
        default: "en-AU",
        valid: ["en-AU", "en-CX", "en-CC", "en-NF", "en-NR", "en-TV", "en-KI"],
    },
    CNY: {
        default: "zh-CN",
        valid: ["zh-CN"],
    },
    KRW: {
        default: "ko-KR",
        valid: ["ko-KR"],
    },
    INR: {
        default: "hi-IN",
        valid: ["hi-IN", "en-IN", "bn-IN", "ta-IN", "te-IN", "mr-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN"],
    },
    BRL: {
        default: "pt-BR",
        valid: ["pt-BR"],
    },
    MXN: {
        default: "es-MX",
        valid: ["es-MX"],
    },
    SEK: {
        default: "sv-SE",
        valid: ["sv-SE"],
    },
    NOK: {
        default: "nb-NO",
        valid: ["nb-NO", "nn-NO"],
    },
    DKK: {
        default: "da-DK",
        valid: ["da-DK", "da-GL", "fo-FO"],
    },
    PLN: {
        default: "pl-PL",
        valid: ["pl-PL"],
    },
    CZK: {
        default: "cs-CZ",
        valid: ["cs-CZ"],
    },
    HUF: {
        default: "hu-HU",
        valid: ["hu-HU"],
    },
    RON: {
        default: "ro-RO",
        valid: ["ro-RO"],
    },
    TRY: {
        default: "tr-TR",
        valid: ["tr-TR"],
    },
    ZAR: {
        default: "en-ZA",
        valid: ["en-ZA", "af-ZA", "zu-ZA", "xh-ZA", "st-ZA", "tn-ZA"],
    },
    SGD: {
        default: "en-SG",
        valid: ["en-SG", "zh-SG", "ms-SG", "ta-SG"],
    },
    HKD: {
        default: "zh-HK",
        valid: ["zh-HK", "en-HK"],
    },
    NZD: {
        default: "en-NZ",
        valid: ["en-NZ", "mi-NZ", "en-CK", "en-NU", "en-PN", "en-TK", "en-WS"],
    },
    AED: {
        default: "ar-AE",
        valid: ["ar-AE"],
    },
    SAR: {
        default: "ar-SA",
        valid: ["ar-SA"],
    },
    THB: {
        default: "th-TH",
        valid: ["th-TH"],
    },
    IDR: {
        default: "id-ID",
        valid: ["id-ID"],
    },
    MYR: {
        default: "ms-MY",
        valid: ["ms-MY", "en-MY", "zh-MY", "ta-MY"],
    },
};

export function toCurrency(value: number, currencyCode: string): string {
    const code = currencyCode.toUpperCase();
    const fallback = `${code} ${value}`;

    if (!Number.isFinite(value)) return fallback;

    const entry = CURRENCY_LOCALES_MAP[code];
    if (!entry) return fallback;

    const browserLocale = typeof navigator !== "undefined" && navigator.language ? navigator.language : entry.default;
    const resolvedLocale = entry.valid.includes(browserLocale) ? browserLocale : entry.default;

    try {
        return new Intl.NumberFormat(resolvedLocale, {
            style: "currency",
            currency: code,
        }).format(value);
    } catch {
        return fallback;
    }
}

export {CURRENCY_LOCALES_MAP};
