/**
 * The vocabulary of the mock world, taken from the real one: the COCO labels Frigate
 * detects (docs/v2/03-detection-and-ai.md, layer 1), the zones this camera will have, the
 * sub-labels the custom classifier is meant to produce (layer 3), and the derived tags the
 * BFF rules engine adds (layer 2).
 */

export const CAMERAS = [
    { name: 'voordeur', display_name: 'Voordeur', width: 1920, height: 1080, retention: { alerts_days: 30, detections_days: 3 } },
    { name: 'achtertuin', display_name: 'Achtertuin', width: 1920, height: 1080, retention: { alerts_days: 30, detections_days: 3 } },
];

export const ZONES = ['pad', 'straat', 'tuin'];

export const LABELS_NL = {
    person: 'Persoon',
    car: 'Auto',
    bicycle: 'Fiets',
    motorcycle: 'Motor',
    dog: 'Hond',
    cat: 'Kat',
};

/** Weighted so a doorbell view looks like a doorbell view: mostly people and cars. */
export const LABEL_WEIGHTS = [
    ['person', 45],
    ['car', 25],
    ['bicycle', 15],
    ['cat', 6],
    ['dog', 5],
    ['motorcycle', 4],
];

export const SUB_LABELS = ['bezorger', 'postbode', 'bewoner', 'onbekend'];

export const DERIVED_TAGS = ['voorbijganger', 'bezoek', 'mogelijk bezorger', 'fietser', 'nacht'];

/** GenAI titles and descriptions, per label, in the register the real prompt asks for. */
export const NARRATIVES = {
    person: [
        ['Persoon bij de voordeur', 'Iemand loopt het pad op en belt aan.'],
        ['Bezorger aan de deur', 'Een bezorger in een blauw uniform zet een pakket bij de deur.'],
        ['Persoon loopt langs', 'Iemand loopt over het pad richting de straat.'],
        ['Postbode bij de brievenbus', 'De postbode doet post in de brievenbus en loopt verder.'],
        ['Bewoner komt thuis', 'Een bekende persoon opent de voordeur en gaat naar binnen.'],
    ],
    car: [
        ['Auto op straat', 'Een donkere auto rijdt langzaam voorbij op straat.'],
        ['Auto parkeert', 'Een auto parkeert voor het huis; er stapt niemand uit.'],
        ['Bestelbus stopt', 'Een witte bestelbus stopt kort langs de stoep.'],
    ],
    bicycle: [
        ['Fietser passeert', 'Een fietser rijdt van links naar rechts over straat.'],
        ['Fiets op het pad', 'Iemand zet een fiets tegen de muur bij het pad.'],
    ],
    motorcycle: [['Scooter rijdt voorbij', 'Een scooter rijdt met hoge snelheid over straat.']],
    dog: [['Hond in beeld', 'Een hond snuffelt rond op het pad.']],
    cat: [['Kat loopt door de tuin', 'Een kat steekt langzaam het pad over.']],
};

export const FEEDBACK_OPTIONS = [
    { value: 'person', label: 'Persoon' },
    { value: 'car', label: 'Auto' },
    { value: 'bicycle', label: 'Fiets' },
    { value: 'bezorger', label: 'Bezorger' },
    { value: 'bewoner', label: 'Bewoner' },
    { value: 'animal', label: 'Kat of hond' },
    { value: 'none', label: 'Niets / vals alarm' },
];

/** The day-one rule set from docs/v2/04-notifications.md, as the mock's stored rules. */
export const DEFAULT_NOTIFICATION_RULES = [
    { id: 1, priority: 1, camera: null, zone: null, labels: [], sub_labels: ['bewoner'], from_time: null, to_time: null, action: 'silent', cooldown_seconds: 0, enabled: true },
    { id: 2, priority: 2, camera: 'voordeur', zone: 'pad', labels: ['person'], sub_labels: [], from_time: '23:00', to_time: '06:00', action: 'priority', cooldown_seconds: 30, enabled: true },
    { id: 3, priority: 3, camera: 'voordeur', zone: 'pad', labels: ['person'], sub_labels: [], from_time: null, to_time: null, action: 'notify', cooldown_seconds: 90, enabled: true },
    { id: 4, priority: 4, camera: null, zone: 'straat', labels: [], sub_labels: [], from_time: null, to_time: null, action: 'silent', cooldown_seconds: 0, enabled: true },
];
