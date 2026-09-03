import axios from 'axios';
import router from '@/router';
import { useLoadingStore } from '@/stores/loading';
import { useAuthStore } from '@/stores/authentication';
import { Preferences } from '@capacitor/preferences';
import { API_BASE_URL } from '@/lib/env.js';

/**
 * The authenticated client. Everything the app sends goes through here, except the token
 * refresh and the logout call, which use `rawClient` below.
 */
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});

/**
 * The same server, no interceptors. The refresh call used to go through `apiClient`, which
 * meant a 401 on the refresh itself re-entered the 401 handler -- the handler was refreshing
 * inside its own failure path. Keeping one un-intercepted client makes that impossible
 * rather than merely unlikely.
 */
const rawClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});

const REFRESH_URL = '/api/token/refresh';

/**
 * Endpoints where a 401 means "these credentials are wrong", not "this session expired".
 *
 * Without this, a mistyped password went: login 401 -> the interceptor tries to refresh ->
 * there is no refresh token yet, because you are not logged in -> SessionExpiredError ->
 * which has no `.response`, so fromAxios() classified it as a network failure and the login
 * screen said **"geen verbinding met de server"**. The one message guaranteed to send you
 * looking at the server instead of at what you typed.
 */
const NO_REFRESH_URLS = ['/api/login', '/api/logout', REFRESH_URL];

/** Thrown when the refresh token itself is gone or rejected: the session is over. */
export class SessionExpiredError extends Error {
    constructor(message = 'De sessie is verlopen') {
        super(message);
        this.name = 'SessionExpiredError';
    }
}

let toast = null;
export function setToast(instance) {
    toast = instance;
}

// ---------------------------------------------------------------------------------------
// Token refresh
//
// The old implementation used an `isRefreshing` flag and a `refreshSubscribers` array. It
// had two failure modes, both permanent: a failed refresh never reset the flag, so every
// later request queued forever, and the subscribers were only ever called on success, so
// the queued promises never settled at all. One shared promise replaces both -- every
// caller awaits the same refresh, and every caller sees the same outcome, success or not.
// ---------------------------------------------------------------------------------------

let refreshPromise = null;

async function performRefresh() {
    const { value: refreshToken } = await Preferences.get({ key: 'refreshToken' });
    if (!refreshToken) {
        throw new SessionExpiredError('Geen refresh token beschikbaar');
    }

    let response;
    try {
        response = await rawClient.post(REFRESH_URL, { refresh_token: refreshToken });
    } catch (error) {
        // Anything the refresh endpoint rejects ends the session. It answers 401 with
        // "Invalid or expired refresh token"; a network failure is indistinguishable from
        // here, and retrying a request whose token we cannot renew only stalls the UI.
        throw new SessionExpiredError(error?.response?.data?.message ?? 'Vernieuwen van de sessie is mislukt');
    }

    const token = response?.data?.token;
    if (!token) {
        throw new SessionExpiredError('Geen token in het antwoord');
    }

    await useAuthStore().updateAccessToken(token);
    return token;
}

function refreshAccessToken() {
    if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}

let loggingOut = false;

async function forceLogout(message) {
    if (loggingOut) return;
    loggingOut = true;

    try {
        const authStore = useAuthStore();
        await authStore.clearAuthData({ forgetRefreshToken: true });
        await authStore.setAppInactive();

        try {
            await rawClient.post('/api/logout');
        } catch {
            // Best effort: the endpoint only clears cookies, and we are leaving anyway.
        }

        useLoadingStore().reset();

        toast?.add({
            severity: 'error',
            summary: 'Sessie verlopen',
            detail: message ?? 'Log opnieuw in om verder te gaan.',
            life: 4000,
        });

        if (router.currentRoute.value.path !== '/') {
            await router.replace('/');
        }
    } finally {
        loggingOut = false;
    }
}

// ---------------------------------------------------------------------------------------
// Interceptors
// ---------------------------------------------------------------------------------------

apiClient.interceptors.request.use(
    async (config) => {
        const { value: token } = await Preferences.get({ key: 'authToken' });
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // `meta.silent` keeps a request out of the global overlay spinner. The feed, the
        // event detail and the timeline all render their own skeletons; covering the screen
        // for them would be worse than showing nothing.
        config._tracksLoading = config.meta?.silent !== true;
        if (config._tracksLoading) {
            useLoadingStore().startLoading();
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    },
);

/** Balanced release of a request's spinner token; safe to call more than once. */
function releaseLoading(config) {
    if (config?._tracksLoading) {
        config._tracksLoading = false;
        useLoadingStore().stopLoading();
    }
}

apiClient.interceptors.response.use(
    (response) => {
        releaseLoading(response.config);
        return response;
    },
    async (error) => {
        const originalRequest = error.config;

        if (!error.response) {
            releaseLoading(originalRequest);
            console.error('[Axios] No response received:', error.message);
            return Promise.reject(error);
        }

        const status = error.response.status;
        const skipsRefresh = NO_REFRESH_URLS.some((url) => originalRequest?.url?.includes(url));

        if (status !== 401 || skipsRefresh || originalRequest?._retry) {
            releaseLoading(originalRequest);
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        try {
            const token = await refreshAccessToken();
            originalRequest.headers.Authorization = `Bearer ${token}`;
            // The retry re-enters the request interceptor and takes its own spinner token,
            // so release this one first to keep the counter balanced.
            releaseLoading(originalRequest);
            return await apiClient(originalRequest);
        } catch (refreshError) {
            releaseLoading(originalRequest);
            if (refreshError instanceof SessionExpiredError) {
                await forceLogout(refreshError.message);
            }
            return Promise.reject(refreshError);
        }
    },
);

const axiosPlugin = {
    install: (app) => {
        setToast(app.config.globalProperties.$toast);
        app.config.globalProperties.$api = apiClient;
    },
};

export default axiosPlugin;
export { apiClient, rawClient, forceLogout };
