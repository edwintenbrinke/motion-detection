import { getMockSettings } from './settings.js';
import { NetworkError } from '@/api/errors.js';

/**
 * Every mock call passes through here, so the app is exercised against a network that is
 * slow and occasionally broken rather than a synchronous one that always works. Code that
 * only ever sees instant success is code whose loading and error states were never run.
 */
export async function simulate({ canFail = true } = {}) {
    const settings = getMockSettings();

    if (settings.offline) {
        await delay(120);
        throw new NetworkError('Geen verbinding (mock: offline)');
    }

    const jitter = settings.jitterMs > 0 ? Math.random() * settings.jitterMs : 0;
    await delay(Math.max(0, settings.latencyMs + jitter));

    if (canFail && settings.failureRate > 0 && Math.random() < settings.failureRate) {
        throw new NetworkError('De server antwoordde niet (mock: gesimuleerde fout)');
    }
}

export function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
