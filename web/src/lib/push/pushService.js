import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { api } from '@/api';
import { APP_VERSION } from '@/lib/env.js';
import { parseDeepLink, routeFromNotification } from '@/lib/deeplinks.js';
import { usePushStore } from '@/stores/push';
import { useAuthStore } from '@/stores/authentication';
import { useEventsStore } from '@/stores/events';

/**
 * FCM registration and the two ways a notification turns into a screen.
 *
 * Installed once at boot. Everything here degrades rather than throws: without a
 * `google-services.json` the plugin fails to initialise, and an app that cannot register for
 * push must still be an app -- Settings says what happened and the rest keeps working.
 */

const TOKEN_KEY = 'pushToken';
const DEVICE_ID_KEY = 'pushDeviceId';
/** Re-register roughly daily, so a token FCM quietly rotated does not go unnoticed. */
const REREGISTER_AFTER_MS = 24 * 60 * 60 * 1000;

let installed = false;

export function createPushService({ router }) {
    const pushStore = usePushStore();
    const authStore = useAuthStore();
    const eventsStore = useEventsStore();

    /**
     * Navigate now if the session is unlocked, otherwise park the route: a tapped
     * notification on a locked phone should land on the event after the fingerprint, not
     * throw the user at the feed and make them find it again.
     */
    async function navigateOrStash(route) {
        if (!route) return;

        const unlocked =
            (await authStore.isTokenValid()) &&
            (await authStore.isBiometricVerified()) &&
            (await authStore.isAppActive());

        if (unlocked) {
            await router.push(route);
        } else {
            authStore.stashPendingRoute(route);
        }
    }

    async function handleUrl(url) {
        await navigateOrStash(parseDeepLink(url));
    }

    async function register() {
        if (!Capacitor.isNativePlatform?.()) {
            pushStore.setStatus('unsupported');
            return;
        }

        let PushNotifications;
        try {
            ({ PushNotifications } = await import('@capacitor/push-notifications'));
        } catch (error) {
            pushStore.setStatus('failed', { error: 'De pushmodule kon niet geladen worden.' });
            return;
        }

        try {
            pushStore.setStatus('registering');

            let permission = await PushNotifications.checkPermissions();
            if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
                permission = await PushNotifications.requestPermissions();
            }

            if (permission.receive !== 'granted') {
                pushStore.setStatus('permission_denied');
                return;
            }

            // Resolves before `registration` fires; the listener does the actual work.
            await PushNotifications.register();
        } catch (error) {
            // The usual cause is a missing google-services.json, which is expected until
            // the Firebase project exists (HANDOFF item 1).
            pushStore.setStatus('failed', {
                error: error?.message ?? 'Firebase is nog niet ingesteld op dit toestel.',
            });
        }
    }

    async function onRegistration({ value: token }) {
        try {
            const { value: knownToken } = await Preferences.get({ key: TOKEN_KEY });
            const { value: knownDeviceId } = await Preferences.get({ key: DEVICE_ID_KEY });

            if (token === knownToken && knownDeviceId) {
                pushStore.setRegistered({ token, deviceId: Number(knownDeviceId) });
                return;
            }

            const result = await api.devices.register({
                token,
                platform: 'android',
                app_version: APP_VERSION,
            });

            await Preferences.set({ key: TOKEN_KEY, value: token });
            if (result?.id != null) {
                await Preferences.set({ key: DEVICE_ID_KEY, value: String(result.id) });
            }

            pushStore.setRegistered({ token, deviceId: result?.id ?? null });
        } catch (error) {
            pushStore.setStatus('failed', { error: error?.message ?? 'Aanmelden bij de server mislukte.' });
        }
    }

    async function unregister() {
        const { value: deviceId } = await Preferences.get({ key: DEVICE_ID_KEY });

        if (deviceId) {
            try {
                await api.devices.unregister(deviceId);
            } catch {
                // A device that cannot be unregistered gets pruned when FCM reports it as
                // UNREGISTERED (docs/v2/04-notifications.md).
            }
        }

        await Preferences.remove({ key: DEVICE_ID_KEY });
        await Preferences.remove({ key: TOKEN_KEY });
        pushStore.$reset();
    }

    async function install() {
        if (installed) return;
        installed = true;

        // Wire the store's public actions to the real implementations, so Settings can
        // drive registration without importing Capacitor.
        pushStore.ensureRegistered = async () => {
            const stale =
                !pushStore.registeredAt ||
                Date.now() - Date.parse(pushStore.registeredAt) > REREGISTER_AFTER_MS;

            if (pushStore.status === 'registered' && !stale) return;
            await register();
        };
        pushStore.unregister = unregister;

        // Deep links work on every platform; push does not.
        CapacitorApp.addListener('appUrlOpen', ({ url }) => handleUrl(url));

        try {
            const launch = await CapacitorApp.getLaunchUrl();
            if (launch?.url) await handleUrl(launch.url);
        } catch {
            // No launch URL, which is the normal case.
        }

        if (!Capacitor.isNativePlatform?.()) {
            pushStore.setStatus('unsupported');
            return;
        }

        let PushNotifications;
        try {
            ({ PushNotifications } = await import('@capacitor/push-notifications'));
        } catch {
            pushStore.setStatus('failed', { error: 'De pushmodule kon niet geladen worden.' });
            return;
        }

        PushNotifications.addListener('registration', onRegistration);

        PushNotifications.addListener('registrationError', (error) => {
            pushStore.setStatus('failed', {
                error: error?.error ?? 'Firebase is nog niet ingesteld op dit toestel.',
            });
        });

        // Arrived while the app is open: no OS notification, so surface it in the feed.
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            const id = notification?.data?.event_id;
            if (id) {
                eventsStore.loadOne(String(id)).catch(() => {});
                eventsStore.refreshUnreadCount();
            }
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            navigateOrStash(routeFromNotification(action?.notification?.data));
        });
    }

    return { install, register, unregister, handleUrl, navigateOrStash };
}
