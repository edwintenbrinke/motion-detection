import { LABELS_NL } from './fixtures.js';

/**
 * Generated stills, as SVG data URIs.
 *
 * They are drawings rather than photographs on purpose: no binary assets to commit, they
 * scale to any size, and each one shows the label, zone and time of the event it belongs to,
 * so a wrong thumbnail in the feed is obvious instead of plausible.
 */

const PALETTE = {
    day: { sky: '#4a5a6a', ground: '#3a4149', wall: '#2f353c' },
    night: { sky: '#12161c', ground: '#0d1116', wall: '#171c22' },
};

const OBJECT_COLOURS = {
    person: '#f2b134',
    car: '#4f9bd9',
    bicycle: '#6cc070',
    motorcycle: '#b07fd8',
    dog: '#d9784f',
    cat: '#d95f8a',
};

function escapeXml(value) {
    return String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}

function svgToDataUri(svg) {
    // encodeURIComponent rather than base64: smaller, and readable in devtools.
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

/**
 * @param {object} event
 * @param {{width?: number, height?: number, detail?: boolean}} options
 */
export function renderFrame(event, { width = 320, height = 180, detail = false } = {}) {
    const hour = new Date(event.started_at).getHours();
    const night = hour >= 21 || hour < 6;
    const colours = night ? PALETTE.night : PALETTE.day;
    const objectColour = OBJECT_COLOURS[event.label] ?? '#9aa5b1';

    // Deterministic placement from the id, so a given event always looks the same.
    const hash = [...event.id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const boxW = event.label === 'car' ? width * 0.34 : width * 0.14;
    const boxH = event.label === 'car' ? height * 0.24 : height * 0.42;
    const x = (hash % 100) / 100 * (width - boxW - 20) + 10;
    const y = height - boxH - height * 0.18 - ((hash >> 7) % 20);

    const time = new Date(event.started_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    const caption = `${LABELS_NL[event.label] ?? event.label ?? 'Beweging'}${event.zones.length ? ' · ' + event.zones[0] : ''}`;

    return svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${colours.sky}"/>
      <stop offset="100%" stop-color="${colours.ground}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#sky)"/>
  <rect x="0" y="${height * 0.55}" width="${width}" height="${height * 0.45}" fill="${colours.ground}"/>
  <rect x="${width * 0.06}" y="${height * 0.18}" width="${width * 0.22}" height="${height * 0.55}" fill="${colours.wall}"/>
  <rect x="${width * 0.11}" y="${height * 0.30}" width="${width * 0.12}" height="${height * 0.43}" fill="${night ? '#2a3038' : '#59636e'}"/>
  <path d="M ${width * 0.30} ${height} L ${width * 0.44} ${height * 0.58} L ${width * 0.62} ${height * 0.58} L ${width * 0.72} ${height} Z"
        fill="${night ? '#161b21' : '#454c54'}" opacity="0.85"/>
  <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="3" fill="${objectColour}" opacity="0.85"/>
  <rect x="${x - 2}" y="${y - 2}" width="${boxW + 4}" height="${boxH + 4}" rx="4" fill="none"
        stroke="${event.severity === 'alert' ? '#ff5b5b' : '#7fd1ff'}" stroke-width="2"/>
  ${night ? `<rect width="${width}" height="${height}" fill="#000" opacity="0.18"/>` : ''}
  <rect x="0" y="${height - (detail ? 30 : 22)}" width="${width}" height="${detail ? 30 : 22}" fill="#000" opacity="0.55"/>
  <text x="8" y="${height - (detail ? 10 : 7)}" font-family="Inter, system-ui, sans-serif"
        font-size="${detail ? 15 : 11}" fill="#ffffff">${escapeXml(caption)}</text>
  <text x="${width - 8}" y="${height - (detail ? 10 : 7)}" text-anchor="end"
        font-family="Inter, system-ui, sans-serif" font-size="${detail ? 15 : 11}" fill="#c9d1d9">${escapeXml(time)}</text>
</svg>`);
}

/** The zone editor's backdrop: a still with no object drawn on it. */
export function renderCameraStill(camera, { width = 960, height = 540 } = {}) {
    return renderFrame(
        { id: camera, label: null, zones: [], severity: 'detection', started_at: new Date().toISOString() },
        { width, height, detail: true },
    );
}
