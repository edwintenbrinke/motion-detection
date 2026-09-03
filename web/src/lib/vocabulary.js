/**
 * The Dutch words for the things Frigate produces.
 *
 * Shared by the UI and the mock generator, so a label the mock invents is a label the app
 * can name. Deliberately not in the mock fixtures: production code must not import from an
 * adapter that only exists for development.
 */

/** COCO labels the detector emits (docs/v2/03-detection-and-ai.md, layer 1). */
export const LABELS_NL = {
    person: 'Persoon',
    car: 'Auto',
    bicycle: 'Fiets',
    motorcycle: 'Motor',
    bus: 'Bus',
    truck: 'Vrachtwagen',
    dog: 'Hond',
    cat: 'Kat',
    bird: 'Vogel',
};

/** Sub-labels from the custom classifier, face or plate recognition (layer 3). */
export const SUB_LABELS_NL = {
    bezorger: 'Bezorger',
    postbode: 'Postbode',
    bewoner: 'Bewoner',
    onbekend: 'Onbekend',
};

/** GenAI's own verdict on a review item (layer 4). Colour, not truth. */
export const GENAI_SEVERITY_NL = {
    normal: 'Normaal',
    suspicious: 'Verdacht',
    dangerous: 'Gevaarlijk',
};

export const CAMERA_NAMES_NL = {
    voordeur: 'Voordeur',
    achtertuin: 'Achtertuin',
};

/** What "dit klopt niet" offers as a correction. */
export const FEEDBACK_OPTIONS = [
    { value: 'person', label: 'Persoon' },
    { value: 'car', label: 'Auto' },
    { value: 'bicycle', label: 'Fiets' },
    { value: 'bezorger', label: 'Bezorger' },
    { value: 'bewoner', label: 'Bewoner' },
    { value: 'animal', label: 'Kat of hond' },
    { value: 'none', label: 'Niets / vals alarm' },
];
