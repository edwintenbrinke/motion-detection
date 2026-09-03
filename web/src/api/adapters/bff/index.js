import { createAuthApi } from './auth.js';
import { createEventsApi } from './events.js';
import { createMediaApi } from './media.js';
import { createCamerasApi } from './cameras.js';
import { createLiveApi } from './live.js';
import { createTimelineApi } from './timeline.js';
import { createZonesApi } from './zones.js';
import { createNotificationsApi } from './notifications.js';
import { createDevicesApi } from './devices.js';

/** The real world: the Symfony BFF over axios. */
export function createBffAdapter() {
    const events = createEventsApi();

    return {
        mode: 'bff',
        auth: createAuthApi(),
        events,
        media: createMediaApi(events),
        cameras: createCamerasApi(),
        live: createLiveApi(),
        timeline: createTimelineApi(),
        zones: createZonesApi(),
        notifications: createNotificationsApi(),
        devices: createDevicesApi(),
    };
}
