export function createMediaApi(events) {
    return {
        /**
         * There is no per-item signing endpoint and there should not be one: re-reading the
         * event returns freshly signed URLs for all three kinds at once (HANDOFF H1).
         */
        async refresh(id) {
            const event = await events.get(id);
            return event.media;
        },
    };
}
