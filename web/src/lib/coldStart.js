import { useAuthStore } from '@/stores/authentication';

/**
 * The cold-start lock.
 *
 * Every fresh launch clears `isAppActive` and `biometricVerified`, so a valid token alone is
 * never enough to get in -- you unlock with a fingerprint instead of retyping the password.
 * That behaviour is deliberate and unchanged; what changes is that it is now awaitable.
 *
 * It used to be fire-and-forget in App.vue, racing the router's first `beforeEach`: on a
 * fast device the guard could read the *previous* session's flags and wave the user
 * straight past the lock screen. The router awaits this promise now.
 */
let coldStart = null;

export function runColdStart() {
    if (!coldStart) {
        coldStart = useAuthStore().resetAppState().catch((error) => {
            console.error('Cold start reset failed:', error);
        });
    }
    return coldStart;
}

export function coldStartComplete() {
    return coldStart ?? Promise.resolve();
}
