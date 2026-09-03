#!/usr/bin/env node
/**
 * Generates public/mock/sample-clip.mp4 -- the one binary the mock world needs.
 *
 * The clip is committed, so this only has to run when it needs regenerating. It exists as a
 * script rather than a README paragraph because "make a small mp4" has enough sharp edges
 * (faststart, a keyframe interval that lets you scrub, a pixel format Android will decode)
 * that writing them down as prose invites getting them wrong.
 *
 *   node scripts/make-sample-clip.mjs
 *
 * Uses ffmpeg from PATH, falling back to the ffmpeg-static devDependency.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/mock/sample-clip.mp4');

async function findFfmpeg() {
    const onPath = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (onPath.status === 0) return 'ffmpeg';

    try {
        const { default: binary } = await import('ffmpeg-static');
        if (binary && existsSync(binary)) return binary;
    } catch {
        /* not installed */
    }

    console.error('No ffmpeg found. Install it, or: npm install --save-dev ffmpeg-static');
    process.exit(1);
}

const ffmpeg = await findFfmpeg();
mkdirSync(dirname(output), { recursive: true });

const args = [
    '-y',
    // A moving test pattern with a burnt-in clock: you can see at a glance whether a seek
    // landed where the scrubber said it would.
    '-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=12:duration=8',
    '-vf', "drawtext=text='%{pts\\:hms}':fontsize=28:fontcolor=white:box=1:boxcolor=black@0.5:x=12:y=12",
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '30',
    // A keyframe every second, matching what the Pi is configured to emit
    // (docs/v2/02-video-transport.md): coarse GOPs make a scrubber jump.
    '-g', '12',
    '-keyint_min', '12',
    '-sc_threshold', '0',
    // yuv420p or Android will not decode it.
    '-pix_fmt', 'yuv420p',
    // moov atom first, so the browser can start playing and issue Range requests without
    // downloading the whole file -- which is the entire point of the player rewrite.
    '-movflags', '+faststart',
    '-an',
    output,
];

const result = spawnSync(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });

if (result.status !== 0) {
    console.error(result.stderr?.toString() ?? 'ffmpeg failed');
    process.exit(1);
}

const { size } = statSync(output);
console.log(`Wrote ${output} (${(size / 1024).toFixed(1)} kB)`);

if (size > 400 * 1024) {
    console.warn('That is larger than intended for a committed fixture; raise -crf.');
}
