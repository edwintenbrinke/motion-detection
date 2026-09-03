<?php

namespace App\Service;

use App\Entity\Event;

/**
 * Turns an event into the three signed URLs the app binds to <img> and <video>.
 *
 * All three are signed with the same $now so they expire together -- the app checks one
 * `expires_at` and refreshes the set (see web/src/api/contract.js#isMediaStale). Signing
 * them independently would mean the clip dying while the thumbnail still looks fine.
 *
 * See docs/v2/07-api-and-data-model.md#media-tokens.
 */
class MediaUrlBuilder
{
    public const KIND_THUMBNAIL = 'thumbnail';
    public const KIND_SNAPSHOT = 'snapshot';
    public const KIND_CLIP = 'clip';

    public function __construct(private readonly MediaTokenService $media_token_service)
    {
    }

    /**
     * @return array{thumbnail: ?string, snapshot: ?string, clip: ?string, expires_at: ?string}
     */
    public function forEvent(Event $event, ?int $now = null): array
    {
        $now ??= time();
        $id = $event->getId();

        // A thumbnail always exists -- Frigate writes one for every event. The other two
        // are conditional, and saying so here stops the app from binding a URL that will
        // 404 and rendering a broken player instead of a still.
        $thumbnail = $this->url(self::KIND_THUMBNAIL, $id, $now);
        $snapshot = $event->hasSnapshot() ? $this->url(self::KIND_SNAPSHOT, $id, $now) : null;
        $clip = $event->hasClip() ? $this->url(self::KIND_CLIP, $id, $now) : null;

        $expires_at = (new \DateTimeImmutable('@' . $this->media_token_service->sign(self::KIND_THUMBNAIL, $id, $now)['exp']))
            ->setTimezone(new \DateTimeZone('UTC'))
            ->format(\DateTimeInterface::ATOM);

        return [
            'thumbnail' => $thumbnail,
            'snapshot' => $snapshot,
            'clip' => $clip,
            'expires_at' => $expires_at,
        ];
    }

    public function url(string $kind, string $id, ?int $now = null): string
    {
        $token = $this->media_token_service->sign($kind, $id, $now);

        return sprintf(
            '/api/media/%s/%s?exp=%d&sig=%s',
            rawurlencode($kind),
            rawurlencode($id),
            $token['exp'],
            $token['sig'],
        );
    }
}
