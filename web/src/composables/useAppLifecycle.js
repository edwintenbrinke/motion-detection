import { onBeforeUnmount } from 'vue';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * "Is the app in front of the user right now?"
 *
 * Two sources, because neither covers both worlds: Capacitor's `appStateChange` is the real
 * signal on Android, and `visibilitychange` is the only one in a browser (and also fires in
 * the WebView, which is why the handler is idempotent).
 *
 * Used for two unrelated things that happen to ask the same question: the live player must
 * stop streaming when nobody is looking, and the session must re-lock after a while away.
 *
 * @param {{onForeground?: () => void, onBackground?: () => void, immediate?: boolean}} handlers
 */
export function useAppLifecycle({ onForeground, onBackground } = {}) {
    let active = true;
    const listeners = [];

    const setActive = (next) => {
        if (next === active) return;
        active = next;
        if (next) {
            onForeground?.();
        } else {
            onBackground?.();
        }
    };

    if (Capacitor.isNativePlatform?.()) {
        const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => setActive(isActive));
        listeners.push(handle);
    }

    let onVisibility = null;
    if (typeof document !== 'undefined') {
        onVisibility = () => setActive(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', onVisibility);
    }

    const stop = async () => {
        if (onVisibility) {
            document.removeEventListener('visibilitychange', onVisibility);
            onVisibility = null;
        }
        while (listeners.length) {
            const handle = await listeners.pop();
            handle?.remove?.();
        }
    };

    // Only auto-clean inside a component; App.vue's root listeners live for the whole app.
    if (typeof onBeforeUnmount === 'function') {
        try {
            onBeforeUnmount(stop);
        } catch {
            // Called outside a component setup(); the caller owns `stop` instead.
        }
    }

    return { stop, isActive: () => active };
}
