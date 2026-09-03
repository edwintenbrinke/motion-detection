#!/usr/bin/env node
/**
 * Patches the generated Android project after `cap sync`.
 *
 * `web/android` is gitignored, so it is regenerated locally and native changes have nowhere
 * to live in the repo. Rather than a paragraph in a README that everyone half-follows, the
 * changes are a script: run `npm run cap:sync` and the project comes out right.
 *
 * Every edit is idempotent -- it checks before it writes -- so running it twice is safe and
 * a `cap sync` that regenerates a file simply gets patched again.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const android = resolve(root, 'android');

if (!existsSync(android)) {
    console.error('No android/ directory. Run `npx cap add android` first.');
    process.exit(1);
}

const manifestPath = resolve(android, 'app/src/main/AndroidManifest.xml');
const appGradlePath = resolve(android, 'app/build.gradle');
const rootGradlePath = resolve(android, 'build.gradle');
const googleServices = resolve(android, 'app/google-services.json');

const changes = [];
const notes = [];

// -- Deep links -------------------------------------------------------------------------
//
// Two filters, because a notification tap and a shared https link are different journeys to
// the same screen. The https one needs autoVerify plus /.well-known/assetlinks.json on the
// host (HANDOFF H6), or Android opens the browser instead of the app.

const INTENT_FILTERS = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="motiondetection" android:host="event" />
            </intent-filter>

            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="https"
                    android:host="motion.edwintenbrinke.nl"
                    android:pathPrefix="/event" />
            </intent-filter>
`;

let manifest = readFileSync(manifestPath, 'utf8');

if (!manifest.includes('android:scheme="motiondetection"')) {
    // Anchor on the launcher activity's closing tag, which Capacitor always generates.
    const anchor = '</activity>';
    const index = manifest.indexOf(anchor);
    if (index === -1) {
        console.error('Could not find </activity> in AndroidManifest.xml; not patching deep links.');
    } else {
        manifest = manifest.slice(0, index) + INTENT_FILTERS + '        ' + manifest.slice(index);
        changes.push('deep-link intent filters');
    }
}

// The push plugin merges this in itself on recent versions; add it only if it is missing,
// since a duplicate permission is a manifest-merger error.
if (!manifest.includes('android.permission.POST_NOTIFICATIONS')) {
    const permission = '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n';
    manifest = manifest.replace('<application', `${permission}\n    <application`);
    changes.push('POST_NOTIFICATIONS permission');
}

writeFileSync(manifestPath, manifest);

// -- Firebase ---------------------------------------------------------------------------
//
// Applying the Google Services plugin without google-services.json fails the build, so this
// is deliberately conditional. Drop the file in and re-run.

if (existsSync(googleServices)) {
    let appGradle = readFileSync(appGradlePath, 'utf8');
    if (!appGradle.includes('com.google.gms.google-services')) {
        appGradle += "\napply plugin: 'com.google.gms.google-services'\n";
        writeFileSync(appGradlePath, appGradle);
        changes.push('google-services plugin (app)');
    }

    let rootGradle = readFileSync(rootGradlePath, 'utf8');
    if (!rootGradle.includes('com.google.gms:google-services')) {
        rootGradle = rootGradle.replace(
            /(dependencies\s*\{)/,
            "$1\n        classpath 'com.google.gms:google-services:4.4.2'",
        );
        writeFileSync(rootGradlePath, rootGradle);
        changes.push('google-services classpath (root)');
    }
} else {
    notes.push(
        'android/app/google-services.json is missing, so Firebase was not wired up.\n' +
        '  Push registration will fail at runtime and the app will say so in Settings > Account.\n' +
        '  Add the file from the Firebase project and run this again. It is gitignored on purpose.',
    );
}

if (changes.length) {
    console.log(`Patched the Android project: ${changes.join(', ')}.`);
} else {
    console.log('Android project already patched; nothing to do.');
}

for (const note of notes) {
    console.warn(`\nNote: ${note}`);
}
