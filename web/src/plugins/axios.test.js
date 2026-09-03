import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createPreferencesMock } from '@/test/preferencesMock.js';

const preferences = createPreferencesMock();
const routerMock = { replace: vi.fn(), currentRoute: { value: { path: '/events' } } };

vi.mock('@capacitor/preferences', () => ({ Preferences: preferences }));
vi.mock('@/router', () => ({ default: routerMock }));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({ BiometricAuth: { checkBiometry: vi.fn(), authenticate: vi.fn() } }));

const { apiClient, rawClient, setToast, SessionExpiredError } = await import('@/plugins/axios.js');
const { useLoadingStore } = await import('@/stores/loading.js');

/**
 * Drives the real interceptor chain by swapping axios' transport, so these tests exercise
 * the shipped code rather than a reimplementation of it.
 */
function stubTransport(client, handler) {
    client.defaults.adapter = async (config) => {
        const result = await handler(config);
        const response = { data: result.data ?? {}, status: result.status, headers: {}, config };
        if (result.status >= 200 && result.status < 300) return response;
        // eslint-disable-next-line no-throw-literal
        throw { isAxiosError: true, config, response, message: `Request failed with status ${result.status}` };
    };
}

describe('axios session handling', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        preferences.store.clear();
        preferences.store.set('authToken', 'expired-token');
        preferences.store.set('refreshToken', 'refresh-token');
        routerMock.replace.mockClear();
        setToast({ add: vi.fn() });
    });

    describe('token refresh', () => {
        it('refreshes once for concurrent 401s and replays both', async () => {
            let refreshCalls = 0;
            let currentToken = 'expired-token';

            stubTransport(rawClient, async (config) => {
                if (!config.url.includes('/api/token/refresh')) return { status: 200, data: {} };
                refreshCalls += 1;
                currentToken = 'fresh-token';
                return { status: 200, data: { token: 'fresh-token' } };
            });

            const seenTokens = [];
            stubTransport(apiClient, async (config) => {
                const sent = config.headers.Authorization;
                seenTokens.push(sent);
                if (sent === 'Bearer expired-token') return { status: 401, data: { message: 'Expired JWT Token' } };
                return { status: 200, data: { ok: true } };
            });

            const [a, b] = await Promise.all([
                apiClient.get('/api/events'),
                apiClient.get('/api/events/unread-count'),
            ]);

            expect(refreshCalls).toBe(1);
            expect(a.data).toEqual({ ok: true });
            expect(b.data).toEqual({ ok: true });
            expect(seenTokens.filter((t) => t === 'Bearer fresh-token')).toHaveLength(2);
            expect(currentToken).toBe('fresh-token');
        });

        it('writes the refreshed token back to storage', async () => {
            stubTransport(rawClient, async () => ({ status: 200, data: { token: 'fresh-token' } }));
            stubTransport(apiClient, async (config) =>
                config.headers.Authorization === 'Bearer expired-token'
                    ? { status: 401, data: {} }
                    : { status: 200, data: {} },
            );

            await apiClient.get('/api/events');

            expect(preferences.store.get('authToken')).toBe('fresh-token');
        });

        it('settles every waiter when the refresh fails, instead of hanging them forever', async () => {
            stubTransport(rawClient, async () => ({ status: 401, data: { message: 'Invalid or expired refresh token' } }));
            stubTransport(apiClient, async () => ({ status: 401, data: {} }));

            const results = await Promise.allSettled([
                apiClient.get('/api/events'),
                apiClient.get('/api/user/settings'),
            ]);

            expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
            expect(results[0].reason).toBeInstanceOf(SessionExpiredError);
            expect(routerMock.replace).toHaveBeenCalledWith('/');
        });

        it('is not wedged by a previous failure -- the next request refreshes again', async () => {
            let refreshCalls = 0;
            let refreshWorks = false;

            stubTransport(rawClient, async (config) => {
                // rawClient also carries the logout call, so count only the refreshes.
                if (!config.url.includes('/api/token/refresh')) return { status: 200, data: {} };
                refreshCalls += 1;
                return refreshWorks
                    ? { status: 200, data: { token: 'fresh-token' } }
                    : { status: 401, data: { message: 'Invalid or expired refresh token' } };
            });
            stubTransport(apiClient, async (config) =>
                config.headers.Authorization === 'Bearer fresh-token'
                    ? { status: 200, data: { ok: true } }
                    : { status: 401, data: {} },
            );

            await expect(apiClient.get('/api/events')).rejects.toBeInstanceOf(SessionExpiredError);
            expect(refreshCalls).toBe(1);

            // This is the regression: the old `isRefreshing` flag was never reset on
            // failure, so every request after the first failure queued and never returned.
            refreshWorks = true;
            preferences.store.set('refreshToken', 'refresh-token');
            preferences.store.set('authToken', 'expired-token');

            const response = await apiClient.get('/api/events');
            expect(response.data).toEqual({ ok: true });
            expect(refreshCalls).toBe(2);
        });

        it('gives up when there is no refresh token at all', async () => {
            preferences.store.delete('refreshToken');
            stubTransport(apiClient, async () => ({ status: 401, data: {} }));

            await expect(apiClient.get('/api/events')).rejects.toBeInstanceOf(SessionExpiredError);
        });

        it('retries a request only once', async () => {
            let attempts = 0;
            stubTransport(rawClient, async () => ({ status: 200, data: { token: 'fresh-token' } }));
            stubTransport(apiClient, async () => {
                attempts += 1;
                return { status: 401, data: {} };
            });

            await expect(apiClient.get('/api/events')).rejects.toBeTruthy();
            expect(attempts).toBe(2);
        });

        it('does not treat a non-401 as a session problem', async () => {
            let refreshCalls = 0;
            stubTransport(rawClient, async (config) => {
                if (config.url.includes('/api/token/refresh')) refreshCalls += 1;
                return { status: 200, data: { token: 'fresh-token' } };
            });
            stubTransport(apiClient, async () => ({ status: 500, data: {} }));

            await expect(apiClient.get('/api/events')).rejects.toBeTruthy();
            expect(refreshCalls).toBe(0);
        });
    });

    describe('the loading counter', () => {
        it('stays balanced across concurrent requests', async () => {
            const loading = useLoadingStore();
            stubTransport(apiClient, async () => ({ status: 200, data: {} }));

            const inFlight = Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);
            await Promise.resolve();
            await inFlight;

            expect(loading.pending).toBe(0);
            expect(loading.isLoading).toBe(false);
        });

        it('is released on failure too', async () => {
            const loading = useLoadingStore();
            stubTransport(apiClient, async () => ({ status: 500, data: {} }));

            await expect(apiClient.get('/a')).rejects.toBeTruthy();
            expect(loading.pending).toBe(0);
        });

        it('stays balanced when a request is retried after a refresh', async () => {
            const loading = useLoadingStore();
            stubTransport(rawClient, async () => ({ status: 200, data: { token: 'fresh-token' } }));
            stubTransport(apiClient, async (config) =>
                config.headers.Authorization === 'Bearer expired-token'
                    ? { status: 401, data: {} }
                    : { status: 200, data: {} },
            );

            await apiClient.get('/api/events');
            expect(loading.pending).toBe(0);
        });

        it('ignores requests marked silent, so the feed can use its own skeletons', async () => {
            const loading = useLoadingStore();
            let peak = 0;
            stubTransport(apiClient, async () => {
                peak = Math.max(peak, loading.pending);
                return { status: 200, data: {} };
            });

            await apiClient.get('/api/events', { meta: { silent: true } });

            expect(peak).toBe(0);
            expect(loading.pending).toBe(0);
        });

        it('does count a normal request', async () => {
            const loading = useLoadingStore();
            let peak = 0;
            stubTransport(apiClient, async () => {
                peak = Math.max(peak, loading.pending);
                return { status: 200, data: {} };
            });

            await apiClient.get('/api/user/settings');

            expect(peak).toBe(1);
        });
    });
});
