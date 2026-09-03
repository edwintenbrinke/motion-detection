import { ref, onMounted, onBeforeUnmount } from 'vue';

/**
 * Pull-to-refresh.
 *
 * Hand-rolled because PrimeVue has no equivalent and the alternatives are a dependency for
 * ~60 lines. The rules that make it feel right rather than merely work:
 *
 * - Only arms at the very top of the scroll container, so it never fights a normal scroll.
 * - Resistance: the finger moves further than the indicator, which is what stops it feeling
 *   like the page came loose.
 * - Cancels on a horizontal drag, so swiping between events does not trigger a refresh.
 */
const THRESHOLD = 70;
const MAX_PULL = 110;
const RESISTANCE = 0.45;

export function usePullToRefresh(onRefresh, { disabled = () => false } = {}) {
    const distance = ref(0);
    const refreshing = ref(false);

    let startY = 0;
    let startX = 0;
    let tracking = false;

    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    function onTouchStart(event) {
        if (refreshing.value || disabled() || event.touches.length !== 1 || !atTop()) return;
        startY = event.touches[0].clientY;
        startX = event.touches[0].clientX;
        tracking = true;
    }

    function onTouchMove(event) {
        if (!tracking) return;

        const dy = event.touches[0].clientY - startY;
        const dx = Math.abs(event.touches[0].clientX - startX);

        // Mostly sideways, or pulling up: not our gesture.
        if (dy <= 0 || dx > Math.abs(dy)) {
            tracking = false;
            distance.value = 0;
            return;
        }

        distance.value = Math.min(MAX_PULL, dy * RESISTANCE);

        // Only take over the gesture once it is unambiguously a pull, so a tap that drifts
        // a pixel still behaves like a tap.
        if (distance.value > 6 && event.cancelable) {
            event.preventDefault();
        }
    }

    async function onTouchEnd() {
        if (!tracking) return;
        tracking = false;

        const shouldRefresh = distance.value >= THRESHOLD * RESISTANCE * 1.4;
        if (!shouldRefresh) {
            distance.value = 0;
            return;
        }

        refreshing.value = true;
        distance.value = THRESHOLD * RESISTANCE;

        try {
            await onRefresh();
        } finally {
            refreshing.value = false;
            distance.value = 0;
        }
    }

    onMounted(() => {
        // Not passive: the move handler has to be able to preventDefault.
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
        window.addEventListener('touchcancel', onTouchEnd);
    });

    onBeforeUnmount(() => {
        window.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
    });

    return { distance, refreshing };
}
