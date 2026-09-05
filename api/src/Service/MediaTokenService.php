<?php

namespace App\Service;

/**
 * Signs and verifies the short-lived media URLs that serve clips, snapshots and
 * notification thumbnails. Exists because none of those three consumers -- <video src>,
 * <img src>, and Android's own notification-image fetcher -- can send an Authorization
 * header. See docs/v2/07-api-and-data-model.md#media-tokens and
 * docs/v2/04-notifications.md#the-snapshot-url-problem.
 *
 * Deliberately framework-free (no DateTime, no request object) so it's trivial to
 * unit-test -- see tests/Service/MediaTokenServiceTest.php.
 */
class MediaTokenService
{
    /**
     * The timeline signs for longer than the default ten minutes.
     *
     * A scrubbing session is not a single request: the playlist hands out signed segment
     * URLs and the player keeps fetching them for as long as someone watches. At ten
     * minutes, playback dies mid-clip with a 403 the player cannot explain. An hour, scoped
     * to one camera and one day, is the trade this is worth.
     * See docs/v2/13-timeline-and-players.md#a2.
     */
    public const TIMELINE_TTL_S = 3600;

    public function __construct(
        private readonly string $signing_key,
        private readonly int $ttl_seconds = 600,
    ) {
        if ($this->signing_key === '')
        {
            throw new \InvalidArgumentException('MEDIA_SIGNING_KEY must not be empty.');
        }
    }

    /**
     * @param int|null $ttl_seconds Overrides the default lifetime; see TIMELINE_TTL_S
     *
     * @return array{exp: int, sig: string}
     */
    public function sign(string $kind, string $id, ?int $now = null, ?int $ttl_seconds = null): array
    {
        $exp = ($now ?? time()) + ($ttl_seconds ?? $this->ttl_seconds);

        return [
            'exp' => $exp,
            'sig' => $this->computeSignature($kind, $id, $exp),
        ];
    }

    /**
     * Constant-time comparison, and the expiry check happens here rather than at the
     * call site so there is exactly one place that can get this wrong.
     */
    public function verify(string $kind, string $id, int $exp, string $signature, ?int $now = null): bool
    {
        if ($exp < ($now ?? time()))
        {
            return false;
        }

        return hash_equals($this->computeSignature($kind, $id, $exp), $signature);
    }

    private function computeSignature(string $kind, string $id, int $exp): string
    {
        return hash_hmac('sha256', "{$kind}|{$id}|{$exp}", $this->signing_key);
    }
}
