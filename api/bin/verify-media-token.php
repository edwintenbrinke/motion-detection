<?php
/**
 * Standalone smoke test for MediaTokenService -- no framework bootstrap needed.
 *
 * There's no PHPUnit in this project yet: adding it tonight pulled in a sebastian/diff
 * version conflict with the existing pinned dev tooling (phpstan/php-cs-fixer), which
 * needed -W (allow upgrades/downgrades across the dependency graph) to resolve -- not a
 * call to make unattended. See docs/v2/HANDOFF.md. This script is the stand-in until
 * that's sorted out deliberately.
 *
 * Run it against the project's own PHP 8.4 image (local PHP here may be older than the
 * >=8.4 composer.json requires):
 *
 *   docker run --rm -v "$(pwd)":/app -w /app --entrypoint php \
 *     motion-detection-app:latest bin/verify-media-token.php
 */
require __DIR__ . '/../vendor/autoload.php';

use App\Service\MediaTokenService;

function assertTrue(bool $cond, string $msg): void {
    if (!$cond) { fwrite(STDERR, "FAIL: $msg\n"); exit(1); }
    echo "OK: $msg\n";
}

$svc = new MediaTokenService('test-signing-key', ttl_seconds: 600);

$now = 1_000_000;
$signed = $svc->sign('snap', 'event-123', $now);
assertTrue(isset($signed['exp'], $signed['sig']), 'sign() returns exp and sig');
assertTrue($signed['exp'] === $now + 600, 'exp is now + ttl');

assertTrue(
    $svc->verify('snap', 'event-123', $signed['exp'], $signed['sig'], $now),
    'valid signature verifies within ttl'
);

assertTrue(
    !$svc->verify('snap', 'event-123', $signed['exp'], $signed['sig'], $signed['exp'] + 1),
    'expired signature is rejected'
);

assertTrue(
    !$svc->verify('clip', 'event-123', $signed['exp'], $signed['sig'], $now),
    'signature does not verify for a different kind (kind is bound into the signature)'
);

assertTrue(
    !$svc->verify('snap', 'event-999', $signed['exp'], $signed['sig'], $now),
    'signature does not verify for a different id'
);

assertTrue(
    !$svc->verify('snap', 'event-123', $signed['exp'], 'garbage', $now),
    'garbage signature is rejected'
);

try {
    new MediaTokenService('');
    fwrite(STDERR, "FAIL: empty signing key should throw\n");
    exit(1);
} catch (InvalidArgumentException $e) {
    echo "OK: empty signing key throws\n";
}

echo "\nAll MediaTokenService checks passed.\n";
