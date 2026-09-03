/**
 * Reading the expiry out of a JWT, so the app stops guessing it.
 *
 * The token TTL was hardcoded as "60 minutes" at every call site. That is right today
 * (lexik `token_ttl: 3600`) and silently wrong the moment the API changes it -- too long and
 * the app keeps a dead token, too short and it logs the user out early. The token says when
 * it expires; read it, and keep the hardcoded value only as a fallback.
 *
 * This is not verification. The signature is the API's business; we only want `exp`.
 */
export function decodeJwtExpiry(token) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    try {
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
        const json = JSON.parse(
            decodeURIComponent(
                atob(padded)
                    .split('')
                    .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
                    .join(''),
            ),
        );
        const exp = Number(json?.exp);
        // `exp` is in seconds since the epoch; everything else in the app is milliseconds.
        return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
    } catch {
        return null;
    }
}
