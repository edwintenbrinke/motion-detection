import { apiClient } from '@/plugins/axios.js';
import { fromAxios, NotImplementedError } from '@/api/errors.js';
import { API_BASE_URL } from '@/lib/env.js';

/**
 * Every BFF call goes through here, so error translation and the spinner opt-out are
 * decided once instead of at each call site.
 *
 * `silent` defaults to true: screens that fetch data render their own skeletons, and the
 * full-screen overlay is reserved for actions the user just triggered (login, saving).
 */
export async function request(config, { silent = true } = {}) {
    try {
        const response = await apiClient({ ...config, meta: { silent } });
        return response.data;
    } catch (error) {
        throw fromAxios(error);
    }
}

export const get = (url, params, options) => request({ method: 'get', url, params }, options);
export const post = (url, data, options) => request({ method: 'post', url, data }, options);
export const put = (url, data, options) => request({ method: 'put', url, data }, options);
export const patch = (url, data, options) => request({ method: 'patch', url, data }, options);
export const del = (url, options) => request({ method: 'delete', url }, options);

/**
 * Endpoints from docs/v2/07-api-and-data-model.md that motion-api does not serve yet
 * (HANDOFF H2, H3, H4, H9) answer 404. Turning that into a distinct error lets the screens
 * say "nog niet beschikbaar" instead of rendering a generic failure -- which matters right
 * now, when most of them are in that state.
 */
export async function getOptional(url, params, options) {
    try {
        return await get(url, params, options);
    } catch (error) {
        if (error?.status === 404) throw new NotImplementedError();
        throw error;
    }
}

/**
 * Makes a server-relative path absolute so it can be bound to <img>/<video>. Signed media
 * URLs authenticate themselves, so they need no header -- which is the whole reason they
 * exist (docs/v2/07-api-and-data-model.md#media-tokens).
 */
export function absolute(url) {
    if (!url) return null;
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}
