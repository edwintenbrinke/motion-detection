/**
 * A seeded generator, so the mock world is the same on every reload. That matters more than
 * it sounds: a bug you can only reproduce once is not reproducible, and "the feed looked
 * wrong" needs the same feed to look at twice.
 */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function createRandom(seed) {
    const next = mulberry32(seed);
    return {
        next,
        /** Integer in [min, max]. */
        int: (min, max) => min + Math.floor(next() * (max - min + 1)),
        float: (min, max) => min + next() * (max - min),
        pick: (items) => items[Math.floor(next() * items.length)],
        /** True with probability p. */
        chance: (p) => next() < p,
        weighted: (entries) => {
            const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
            let roll = next() * total;
            for (const [value, weight] of entries) {
                roll -= weight;
                if (roll <= 0) return value;
            }
            return entries[entries.length - 1][0];
        },
    };
}
