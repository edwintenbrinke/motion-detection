import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { useAuthStore } from '@/stores/authentication';

/**
 * The cold-start lock.
 *
 * On a device with biometrics, every fresh launch clears `isAppActive` and
 * `biometricVerified`, so a valid token alone is never enough to get in -- you unlock with a
 * fingerprint instead of retyping the password. That is the whole point, and it is the only
 * thing standing between a stolen unlocked phone and the camera.
 *
 * **In a browser there is nothing to unlock with.** The same lock there does not add a
 * factor, it just deletes one: every refresh becomes a full password login, because the
 * fingerprint path that makes the lock cheap does not exist. So the lock is applied only
 * where it can actually be satisfied.
 *
 * The relock-after-N-minutes timer is unaffected and still applies to both -- that one is
 * about walking away from a screen, not about which device you are looking at.
 */
let coldStart = null;

async function reset() {
    const authStore = useAuthStore();

    let biometryAvailable = false;
    try {
        biometryAvailable = (await BiometricAuth.checkBiometry())?.isAvailable === true;
    } catch {
        // The plugin throws on platforms it does not support, which is itself the answer.
        biometryAvailable = false;
    }

    if (!biometryAvailable) {
        // Web: the stored token and the JWT cookie are the credential, as in any other web
        // app. Mark the session active so the router guard's third flag is satisfied, and
        // leave `biometricVerified` alone -- `isTokenValid()` still decides whether the
        // session is real.
        await authStore.setAppActiveWithoutBiometry();
        return;
    }

    await authStore.resetAppState();
}

export function runColdStart() {
    if (!coldStart) {
        coldStart = reset().catch((error) => {
            console.error('Cold start reset failed:', error);
        });
    }
    return coldStart;
}

export function coldStartComplete() {
    return coldStart ?? Promise.resolve();
}
