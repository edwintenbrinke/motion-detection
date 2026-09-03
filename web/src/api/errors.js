/**
 * One error vocabulary for both adapters, so views never have to know whether they are
 * looking at an axios failure or a mock one.
 */

export class ApiError extends Error {
    constructor(message, { status = null, code = null, retryable = false, cause = null } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.retryable = retryable;
        this.cause = cause;
    }
}

/** No answer at all: no connection, DNS, a dead tunnel, airplane mode. */
export class NetworkError extends ApiError {
    constructor(message = 'Geen verbinding', options = {}) {
        super(message, { ...options, code: 'network', retryable: true });
        this.name = 'NetworkError';
    }
}

/** The endpoint does not exist yet. Several v2 endpoints are in this state by design. */
export class NotImplementedError extends ApiError {
    constructor(message = 'Deze functie is nog niet beschikbaar op de server') {
        super(message, { status: 404, code: 'not_implemented', retryable: false });
        this.name = 'NotImplementedError';
    }
}

const MESSAGES = {
    400: 'Het verzoek klopte niet',
    401: 'Niet ingelogd',
    403: 'Geen toegang',
    404: 'Niet gevonden',
    409: 'Conflict met de huidige staat',
    422: 'De ingevoerde gegevens kloppen niet',
    429: 'Te veel verzoeken, probeer het zo opnieuw',
    500: 'Er ging iets mis op de server',
    502: 'De server is even onbereikbaar',
    503: 'De server is even onbereikbaar',
    504: 'De server reageerde niet op tijd',
};

/** Turns an axios rejection into one of the above. */
export function fromAxios(error) {
    if (error instanceof ApiError) return error;

    if (!error?.response) {
        return new NetworkError('Geen verbinding met de server', { cause: error });
    }

    const { status, data } = error.response;
    const message = data?.message ?? data?.detail ?? MESSAGES[status] ?? 'Onbekende fout';

    return new ApiError(message, {
        status,
        code: data?.code ?? null,
        // 5xx and 429 are worth another go; a 4xx will fail identically next time.
        retryable: status >= 500 || status === 429,
        cause: error,
    });
}

/** True when showing cached content beats showing an error. */
export function isOffline(error) {
    return error instanceof NetworkError || (error instanceof ApiError && error.retryable);
}
