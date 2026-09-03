import { defineStore } from 'pinia';

/**
 * The global overlay spinner.
 *
 * This used to be a boolean, which meant two overlapping requests raced: the first response
 * hid the spinner while the second was still in flight. It is a counter now, and requests
 * that should not drive it at all (the events feed, which has its own skeletons) pass
 * `meta.silent` -- see src/plugins/axios.js.
 */
export const useLoadingStore = defineStore('loading', {
    state: () => ({
        pending: 0,
    }),

    getters: {
        isLoading: (state) => state.pending > 0,
    },

    actions: {
        startLoading() {
            this.pending += 1;
        },

        stopLoading() {
            // Never go negative: an unbalanced stop would otherwise leave the counter below
            // zero and swallow the next genuine spinner.
            this.pending = Math.max(0, this.pending - 1);
        },

        reset() {
            this.pending = 0;
        },
    },
});
