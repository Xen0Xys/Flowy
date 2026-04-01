export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 256;
export const FAMILY_NAME_MIN_LENGTH = 3;
export const FAMILY_NAME_MAX_LENGTH = 50;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidEmail(value: string): boolean {
    return EMAIL_REGEX.test(value.trim());
}

export function isValidPassword(value: string): boolean {
    const size = value.length;
    return size >= PASSWORD_MIN_LENGTH && size <= PASSWORD_MAX_LENGTH;
}

export function isValidUsername(value: string): boolean {
    const size = value.trim().length;
    return size >= USERNAME_MIN_LENGTH && size <= USERNAME_MAX_LENGTH;
}

export function isValidFamilyName(value: string): boolean {
    const size = value.trim().length;
    return size >= FAMILY_NAME_MIN_LENGTH && size <= FAMILY_NAME_MAX_LENGTH;
}

export function isValidCurrencyCode(value: string): boolean {
    return /^[A-Z]{3}$/.test(value.trim().toUpperCase());
}

export function isValidUuidV7(value: string): boolean {
    return UUID_V7_REGEX.test(value.trim());
}

export function normalizeCurrencyCode(value: string): string {
    return value.trim().toUpperCase();
}
