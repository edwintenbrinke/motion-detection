import { useToast } from 'primevue/usetoast';

/**
 * Toasts, without letting one take a screen down with it.
 *
 * `useToast()` throws "No PrimeVue Toast provided!" when the injection is not in place --
 * which can happen during a hot reload, in a test, or if the plugin order ever changes.
 * Thrown from `setup()`, that stops the whole component from mounting. A confirmation
 * message is never worth a blank screen, so failures here degrade to the console.
 */
export function useNotify() {
    let toast = null;

    try {
        toast = useToast();
    } catch {
        toast = null;
    }

    const add = (options) => {
        if (toast) {
            toast.add(options);
            return;
        }
        console.info(`[toast] ${options.summary ?? ''} ${options.detail ?? ''}`.trim());
    };

    return {
        success: (summary, detail) => add({ severity: 'success', summary, detail, life: 2500 }),
        error: (summary, detail) => add({ severity: 'error', summary, detail, life: 3500 }),
        warn: (summary, detail) => add({ severity: 'warn', summary, detail, life: 3000 }),
        add,
    };
}
