export const SSO_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const SSO_TICKET_TTL_MS = 60 * 1000; // 1 minute
// RFC 7636: S256 challenge is an unpadded base64url SHA-256 digest (43 chars),
// verifier is 43-128 unreserved characters.
export const SSO_PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const SSO_PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
export const SSO_TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const SSO_STATE_PURPOSE_LOGIN = "login";
export const SSO_STATE_PURPOSE_LINK = "link";
export const SSO_MAX_USERNAME_ATTEMPTS = 20;
