export const SSO_VERIFIER_STORAGE_KEY = "flowy_sso_verifier";

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Random PKCE verifier (RFC 7636 §4.1) binding an SSO login to this tab:
 * only the browser holding it can redeem the ticket issued by the callback.
 */
export function generatePkceVerifier(): string {
    return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** S256 challenge (RFC 7636 §4.2) sent to the backend when the login starts. */
export async function computePkceChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return toBase64Url(new Uint8Array(digest));
}
