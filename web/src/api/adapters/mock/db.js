import { createRandom } from './rng.js';
import { MOCK_SEED } from '@/lib/env.js';
import { CAMERAS, LABEL_WEIGHTS, SUB_LABELS, NARRATIVES } from './fixtures.js';

/**
 * Seven days of plausible events, built once per page load.
 *
 * "Plausible" is doing real work here. A uniformly random feed hides exactly the problems
 * this app has to handle: quiet nights, clusters around the door in the afternoon, long
 * gaps, a run of near-identical events a minute apart. The distribution below is shaped to
 * produce those.
 */

const DAYS = 7;
const ZONES_BY_CAMERA = { voordeur: ['pad', 'straat'], achtertuin: ['tuin'] };

let db = null;

export function getDb() {
    if (!db) db = build();
    return db;
}

export function resetDb() {
    db = null;
}

function build() {
    const random = createRandom(MOCK_SEED);
    const now = Date.now();
    const events = [];

    for (let dayOffset = 0; dayOffset < DAYS; dayOffset += 1) {
        const dayStart = new Date(now - dayOffset * 86_400_000);
        dayStart.setHours(0, 0, 0, 0);

        const count = random.int(8, 20);
        for (let i = 0; i < count; i += 1) {
            const event = makeEvent(random, dayStart, now);
            if (event) events.push(event);
        }
    }

    events.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at) || (a.id < b.id ? 1 : -1));

    // Only the newest handful are unread: an app you opened this morning does not have
    // a hundred unread events, and the badge should look like a real one.
    events.forEach((event, index) => {
        event.seen = index >= 5;
    });

    return { events, rules: null, zones: {}, masks: {}, snoozedUntil: null };
}

function makeEvent(random, dayStart, now) {
    // Daylight-weighted, with a real if smaller night-time tail -- the night events are the
    // ones the notification rules care most about.
    const hour = random.weighted([
        [random.int(0, 5), 8],
        [random.int(6, 8), 14],
        [random.int(9, 12), 20],
        [random.int(13, 17), 30],
        [random.int(18, 20), 20],
        [random.int(21, 23), 8],
    ]);

    const started = new Date(dayStart);
    started.setHours(hour, random.int(0, 59), random.int(0, 59), 0);
    if (started.getTime() > now) return null;

    const camera = random.chance(0.75) ? CAMERAS[0].name : CAMERAS[1].name;
    const label = random.weighted(LABEL_WEIGHTS);
    const zones = pickZones(random, camera, label);
    const duration = durationFor(random, label);
    const ended = new Date(started.getTime() + duration * 1000);

    // A review item is an "alert" when something worth caring about entered a zone that
    // matters -- person or car on the path. Everything else is recorded and searchable but
    // silent. docs/v2/04-notifications.md.
    const severity = zones.includes('pad') && (label === 'person' || label === 'car') ? 'alert' : 'detection';

    const subLabel = label === 'person' && random.chance(0.45) ? random.pick(SUB_LABELS) : null;
    const enriched = severity === 'alert' && random.chance(0.8);
    const [title, description] = enriched ? random.pick(NARRATIVES[label] ?? [[null, null]]) : [null, null];

    const id = `${started.getTime().toString(36)}-${random.int(0x1000, 0xffff).toString(16)}`;

    return {
        id,
        camera,
        severity,
        label,
        sub_label: subLabel,
        zones,
        derived_tags: derivedTags(label, zones, hour, duration),
        top_score: Number(random.float(0.62, 0.97).toFixed(2)),
        started_at: started.toISOString(),
        ended_at: ended.toISOString(),
        has_clip: true,
        has_snapshot: true,
        title,
        description,
        genai_severity: enriched ? genaiSeverity(random, hour, subLabel) : null,
        seen: true,
        feedback: null,
    };
}

function pickZones(random, camera, label) {
    const available = ZONES_BY_CAMERA[camera] ?? ['pad'];
    if (camera === 'achtertuin') return ['tuin'];
    // Cars and motorcycles are usually only on the street; people usually reach the path.
    if (label === 'car' || label === 'motorcycle') {
        return random.chance(0.85) ? ['straat'] : ['straat', 'pad'];
    }
    if (label === 'person') {
        return random.chance(0.6) ? ['pad'] : random.chance(0.5) ? ['straat', 'pad'] : ['straat'];
    }
    return [random.pick(available)];
}

function durationFor(random, label) {
    if (label === 'car' || label === 'motorcycle') return random.int(3, 9);
    if (label === 'bicycle') return random.int(3, 8);
    if (label === 'person') return random.int(6, 95);
    return random.int(4, 25);
}

/**
 * Layer 2 of the tagging ladder: deterministic rules over the detector's output. Cheap,
 * explainable, and worth more than it looks -- "bezoek, 14 s bij de deur" needs no model.
 */
function derivedTags(label, zones, hour, duration) {
    const tags = [];
    const onPath = zones.includes('pad');

    if (label === 'car' && !onPath && duration < 5) tags.push('voorbijganger');
    if (label === 'bicycle') tags.push('fietser');
    if (label === 'person' && onPath && duration > 8 && duration < 120) tags.push('bezoek');
    if (label === 'person' && onPath && hour >= 8 && hour < 18 && duration >= 10 && duration <= 90) {
        tags.push('mogelijk bezorger');
    }
    if (onPath && (hour >= 23 || hour < 6)) tags.push('nacht');

    return tags;
}

function genaiSeverity(random, hour, subLabel) {
    if (subLabel === 'bewoner') return 'normal';
    if ((hour >= 23 || hour < 6) && random.chance(0.5)) return random.chance(0.3) ? 'dangerous' : 'suspicious';
    return random.chance(0.85) ? 'normal' : 'suspicious';
}
