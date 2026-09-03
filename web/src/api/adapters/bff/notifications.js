import { getOptional, put, post } from './client.js';

export function createNotificationsApi() {
    return {
        /** HANDOFF H9: NotificationRuleMatcher exists server-side; nothing HTTP reaches it. */
        async getRules() {
            const raw = await getOptional('/api/notification-rules');
            return raw?.rules ?? (Array.isArray(raw) ? raw : []);
        },

        async putRules(rules) {
            await put('/api/notification-rules', { rules }, { silent: false });
        },

        async snooze(minutes) {
            await post('/api/notifications/snooze', { minutes }, { silent: false });
        },

        async test() {
            await post('/api/notifications/test', {}, { silent: false });
        },
    };
}
