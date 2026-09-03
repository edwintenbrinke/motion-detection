import { describe, it, expect } from 'vitest';
import { headline, chips, labelNl, subLabelNl, cameraNl, genaiSeverityNl, isAlert, fallbackIcon } from './eventPresenter.js';

const base = {
    id: 'a',
    camera: 'voordeur',
    severity: 'detection',
    label: 'person',
    sub_label: null,
    zones: [],
    derived_tags: [],
    title: null,
    description: null,
    genai_severity: null,
};

describe('event presenter', () => {
    describe('headline', () => {
        it('prefers the GenAI title when it has arrived', () => {
            expect(headline({ ...base, title: 'Persoon bij de voordeur' })).toBe('Persoon bij de voordeur');
        });

        it('falls back to the deterministic label -- never a gap while the model catches up', () => {
            expect(headline(base)).toBe('Persoon');
        });

        it('adds the sub-label when there is one', () => {
            expect(headline({ ...base, sub_label: 'bezorger' })).toBe('Persoon · Bezorger');
        });

        it('says something even for an event with no label at all', () => {
            expect(headline({ ...base, label: null })).toBe('Beweging');
        });
    });

    describe('translation', () => {
        it('names the COCO labels in Dutch', () => {
            expect(labelNl('person')).toBe('Persoon');
            expect(labelNl('bicycle')).toBe('Fiets');
        });

        it('capitalises anything it does not know rather than showing a raw token', () => {
            expect(labelNl('skateboard')).toBe('Skateboard');
            expect(subLabelNl('koerier')).toBe('Koerier');
            expect(cameraNl('zijkant')).toBe('Zijkant');
        });

        it('leaves absent values absent', () => {
            expect(labelNl(null)).toBeNull();
            expect(subLabelNl(null)).toBeNull();
            expect(genaiSeverityNl(null)).toBeNull();
            expect(cameraNl(null)).toBe('');
        });

        it('translates the GenAI verdict', () => {
            expect(genaiSeverityNl('suspicious')).toBe('Verdacht');
            expect(genaiSeverityNl('dangerous')).toBe('Gevaarlijk');
        });
    });

    describe('chips', () => {
        it('carries label, sub-label, zones and derived tags, in that order', () => {
            const result = chips({ ...base, sub_label: 'bezorger', zones: ['pad'], derived_tags: ['bezoek'] });
            expect(result.map((c) => c.kind)).toEqual(['label', 'sub', 'zone', 'tag']);
            expect(result.map((c) => c.text)).toEqual(['Persoon', 'Bezorger', 'Pad', 'Bezoek']);
        });

        it('gives every chip a stable key, so a re-render does not reorder them', () => {
            const result = chips({ ...base, zones: ['pad', 'straat'] });
            expect(new Set(result.map((c) => c.key)).size).toBe(result.length);
        });

        it('produces nothing for an empty event', () => {
            expect(chips({ ...base, label: null })).toEqual([]);
        });
    });

    describe('severity', () => {
        it('distinguishes an alert from a detection', () => {
            expect(isAlert({ ...base, severity: 'alert' })).toBe(true);
            expect(isAlert(base)).toBe(false);
        });

        it('picks a fallback icon that matches the severity', () => {
            expect(fallbackIcon({ ...base, severity: 'alert' })).toContain('exclamation');
            expect(fallbackIcon(base)).toContain('eye');
        });
    });
});
