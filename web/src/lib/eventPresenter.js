import { LABELS_NL, SUB_LABELS_NL, GENAI_SEVERITY_NL, CAMERA_NAMES_NL } from '@/lib/vocabulary.js';

/**
 * Turning an event into the words and colours the UI shows.
 *
 * Kept out of the components because the feed card, the detail view, the timeline marker
 * and (later) the notification body all have to describe the same event the same way.
 */

const capitalise = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

export function labelNl(label) {
    if (!label) return null;
    return LABELS_NL[label] ?? capitalise(label);
}

export function subLabelNl(subLabel) {
    if (!subLabel) return null;
    return SUB_LABELS_NL[subLabel] ?? capitalise(subLabel);
}

export function cameraNl(camera) {
    if (!camera) return '';
    return CAMERA_NAMES_NL[camera] ?? capitalise(camera);
}

export function genaiSeverityNl(severity) {
    return severity ? (GENAI_SEVERITY_NL[severity] ?? capitalise(severity)) : null;
}

/**
 * The card's first line. The GenAI title when there is one, otherwise the deterministic
 * label -- never wait for the model, and never show a gap where it has not arrived.
 */
export function headline(event) {
    if (event.title) return event.title;

    const what = labelNl(event.label) ?? 'Beweging';
    const who = subLabelNl(event.sub_label);
    return who ? `${what} · ${who}` : what;
}

/** The chips under the headline: what it was, who it was, and where. */
export function chips(event) {
    const result = [];

    if (event.label) result.push({ key: `label-${event.label}`, text: labelNl(event.label), kind: 'label' });
    if (event.sub_label) result.push({ key: `sub-${event.sub_label}`, text: subLabelNl(event.sub_label), kind: 'sub' });

    for (const zone of event.zones) {
        result.push({ key: `zone-${zone}`, text: capitalise(zone), kind: 'zone' });
    }

    // Layer-2 rules output: cheap, deterministic, and the thing that explains an event
    // without opening it ("bezoek -- 14 s bij de deur").
    for (const tag of event.derived_tags) {
        result.push({ key: `tag-${tag}`, text: capitalise(tag), kind: 'tag' });
    }

    return result;
}

export function isAlert(event) {
    return event.severity === 'alert';
}

export function severityLabel(event) {
    return isAlert(event) ? 'Alert' : 'Detectie';
}

/** The icon a card falls back to when it has no usable thumbnail. */
export function fallbackIcon(event) {
    return isAlert(event) ? 'pi pi-exclamation-triangle' : 'pi pi-eye';
}
