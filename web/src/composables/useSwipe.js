import { onMounted, onBeforeUnmount } from 'vue';

/**
 * Horizontal swipe on an element, for moving between events.
 *
 * The thresholds are what keep it from firing on a scroll: the gesture has to be mostly
 * horizontal and cover real distance. Vertical-dominant movement is handed back to the page
 * immediately rather than being swallowed.
 */
const MIN_DISTANCE = 60;
const MAX_OFF_AXIS_RATIO = 0.6;

export function useSwipe(target, { onLeft, onRight } = {}) {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    function onTouchStart(event) {
        if (event.touches.length !== 1) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        tracking = true;
    }

    function onTouchEnd(event) {
        if (!tracking) return;
        tracking = false;

        const touch = event.changedTouches?.[0];
        if (!touch) return;

        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;

        if (Math.abs(dx) < MIN_DISTANCE) return;
        if (Math.abs(dy) > Math.abs(dx) * MAX_OFF_AXIS_RATIO) return;

        // Swiping left moves forward through the list, matching how a photo gallery reads.
        if (dx < 0) onLeft?.();
        else onRight?.();
    }

    onMounted(() => {
        const el = target.value ?? window;
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
    });

    onBeforeUnmount(() => {
        const el = target.value ?? window;
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchend', onTouchEnd);
    });
}
