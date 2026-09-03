import { post, get } from './client.js';

export function createAuthApi() {
    return {
        async login({ username, password }) {
            // Not silent: the user is waiting on this one and the overlay is the feedback.
            return await post('/api/login', { username, password }, { silent: false });
        },

        async refresh(refreshToken) {
            return await post('/api/token/refresh', { refresh_token: refreshToken });
        },

        async logout() {
            await post('/api/logout');
        },

        async initialize() {
            return await get('/api/user/initialize');
        },
    };
}
