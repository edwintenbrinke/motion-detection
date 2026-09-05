<?php

namespace App\Controller;

use App\Repository\EventRepository;
use App\Service\FrigateClient;
use App\Service\MediaTokenService;
use OpenApi\Attributes as OA;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * One day of a camera, for the scrubber (HANDOFF H4).
 *
 * Three sources, each answering a different question:
 *   - recordings: which parts of the day exist at all, so the strip can show gaps
 *   - previews:   what it looked like, cheaply enough to drag over
 *   - events:     where the interesting moments are
 *
 * Media URLs are signed with the same MediaTokenService as everything else, under a
 * `timeline` kind, and all share one `expires_at` so the app refreshes the set rather than
 * discovering each dead URL as it reaches it.
 */
#[OA\Tag(name: 'Cameras')]
#[Route('/api/cameras/{camera}')]
class CameraTimelineController extends AbstractController
{
    public function __construct(
        private readonly FrigateClient $frigate_client,
        private readonly MediaTokenService $media_token_service,
        private readonly EventRepository $event_repository,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[OA\Get(
        summary: 'Recordings, previews and events for one local day',
        responses: [
            new OA\Response(response: 200, description: 'A day of timeline'),
            new OA\Response(response: 400, description: 'Bad date or timezone'),
        ]
    )]
    #[Route('/timeline', name: 'api_cameras_timeline', methods: ['GET'])]
    public function timeline(string $camera, Request $request): Response
    {
        $date = (string) $request->query->get('date', '');
        $tz_name = (string) $request->query->get('tz', 'Europe/Amsterdam');

        try
        {
            // The day is the *viewer's* day, not UTC's. Resolving it in their zone is the
            // whole reason `tz` is a parameter: a timeline that starts at 01:00 or 02:00
            // depending on the season is worse than one that is simply wrong.
            $tz = new \DateTimeZone($tz_name);
            $start = new \DateTimeImmutable(($date !== '' ? $date : 'today') . ' 00:00:00', $tz);
        }
        catch (\Throwable)
        {
            return $this->json(['message' => 'Ongeldige datum of tijdzone'], Response::HTTP_BAD_REQUEST);
        }

        $end = $start->modify('+1 day');
        $after = $start->getTimestamp();
        $before = $end->getTimestamp();

        $now = time();
        // An hour rather than the default ten minutes: the previews and the playlists this
        // signs are fetched for as long as someone keeps scrubbing, not once.
        // See docs/v2/13-timeline-and-players.md#a2.
        $token = $this->media_token_service->sign('timeline', $camera, $now, MediaTokenService::TIMELINE_TTL_S);
        $query = sprintf('exp=%d&sig=%s', $token['exp'], $token['sig']);

        try
        {
            $recordings = $this->frigate_client->recordings($camera, $after, $before);
            $previews = $this->frigate_client->previews($camera, $after, $before);
        }
        catch (\Throwable $e)
        {
            $this->logger->error('Timeline kon niet worden opgehaald: ' . $e->getMessage());

            return $this->json(['message' => 'Tijdlijn niet beschikbaar'], Response::HTTP_SERVICE_UNAVAILABLE);
        }

        return $this->json([
            'camera' => $camera,
            'date' => $start->format('Y-m-d'),
            'expires_at' => (new \DateTimeImmutable('@' . $token['exp']))
                ->setTimezone(new \DateTimeZone('UTC'))
                ->format(\DateTimeInterface::ATOM),
            'recordings' => $this->groupRecordings($recordings, $camera, $query),
            'previews' => $this->mapPreviews($previews, $query),
            'events' => $this->eventsBetween($camera, $start, $end),
        ]);
    }

    /**
     * Frigate returns one entry per **recording segment** -- `start_time`, `end_time`,
     * `duration` -- not per hour, and they are about ten seconds each. Two hours came back
     * as 720 entries; a full day is over eight thousand. Handing that to a scrubber would
     * be pointless as well as enormous, since what it needs to know is which parts of the
     * day exist at all.
     *
     * So: merge contiguous segments into spans, tolerating a small gap. Frigate cuts on
     * keyframes, so consecutive segments do not line up to the millisecond, and treating
     * every rounding difference as a hole would draw a day of solid recording as thousands
     * of slivers.
     *
     * @param list<array<string, mixed>> $recordings
     *
     * @return list<array{start: string, end: string, vod_url: string}>
     */
    private function groupRecordings(array $recordings, string $camera, string $query): array
    {
        // Slightly more than one segment length, so a missed segment still reads as a gap.
        $gap_tolerance_s = 15;

        $segments = [];
        foreach ($recordings as $entry)
        {
            $start = $entry['start_time'] ?? null;
            $end = $entry['end_time'] ?? null;
            if (!is_numeric($start) || !is_numeric($end) || $end <= $start)
            {
                continue;
            }
            $segments[] = ['start' => (float) $start, 'end' => (float) $end];
        }

        usort($segments, static fn (array $a, array $b): int => $a['start'] <=> $b['start']);

        $spans = [];
        foreach ($segments as $segment)
        {
            $last = $spans !== [] ? count($spans) - 1 : null;

            if ($last !== null && $segment['start'] - $spans[$last]['end'] <= $gap_tolerance_s)
            {
                $spans[$last]['end'] = max($spans[$last]['end'], $segment['end']);
                continue;
            }

            $spans[] = ['start' => $segment['start'], 'end' => $segment['end']];
        }

        return array_map(
            // The times go out as ATOM like every other timestamp in this API; the unix
            // seconds stay inside the URL, because that is Frigate's path format and not
            // part of our contract.
            fn (array $span): array => [
                'start' => $this->iso((int) floor($span['start'])),
                'end' => $this->iso((int) ceil($span['end'])),
                'vod_url' => sprintf(
                    '/api/timeline/%s/vod/%d/%d/index.m3u8?%s',
                    rawurlencode($camera),
                    (int) floor($span['start']),
                    (int) ceil($span['end']),
                    $query,
                ),
            ],
            $spans,
        );
    }

    /**
     * @param list<array<string, mixed>> $previews
     *
     * @return list<array{start: string, end: string, preview_url: string}>
     */
    private function mapPreviews(array $previews, string $query): array
    {
        $mapped = [];
        foreach ($previews as $preview)
        {
            $src = (string) ($preview['src'] ?? '');
            if ($src === '')
            {
                continue;
            }

            $mapped[] = [
                'start' => $this->iso((float) ($preview['start'] ?? 0)),
                'end' => $this->iso((float) ($preview['end'] ?? 0)),
                // Frigate's own path, signed and served back through our proxy. Passing the
                // path through rather than rebuilding it keeps us out of guessing its
                // filename convention, which is not part of any contract.
                'preview_url' => sprintf('/api/timeline/file%s?%s', $src, $query),
            ];
        }

        return $mapped;
    }

    /**
     * @return list<array{id: string, start: string, end: ?string, label: string, severity: string}>
     */
    private function eventsBetween(string $camera, \DateTimeImmutable $start, \DateTimeImmutable $end): array
    {
        $events = $this->event_repository->createQueryBuilder('e')
            ->where('e.camera = :camera')
            ->andWhere('e.started_at >= :start')
            ->andWhere('e.started_at < :end')
            ->setParameter('camera', $camera)
            ->setParameter('start', $start)
            ->setParameter('end', $end)
            ->orderBy('e.started_at', 'ASC')
            ->getQuery()
            ->getResult();

        return array_map(
            fn ($event): array => [
                'id' => $event->getId(),
                'start' => $this->iso($event->getStartedAt()->getTimestamp()),
                'end' => $event->getEndedAt() !== null ? $this->iso($event->getEndedAt()->getTimestamp()) : null,
                'label' => $event->getLabel(),
                'severity' => $event->getSeverity()->value,
            ],
            $events,
        );
    }

    /**
     * Unix seconds in, ATOM out.
     *
     * Frigate speaks unix seconds and every other endpoint in this API speaks ATOM
     * (EventOutputDTO, and `expires_at` in this very response). The conversion has to
     * happen somewhere, and this is the boundary. It used to happen nowhere, and the app
     * read these three arrays with `Date.parse()` -- which turns a number into NaN, which
     * draws an empty strip and finds no recording under the playhead, with no error
     * anywhere. See docs/v2/13-timeline-and-players.md#a1.
     */
    private function iso(float $unix): string
    {
        return (new \DateTimeImmutable('@' . (int) round($unix)))
            ->setTimezone(new \DateTimeZone('UTC'))
            ->format(\DateTimeInterface::ATOM);
    }
}
