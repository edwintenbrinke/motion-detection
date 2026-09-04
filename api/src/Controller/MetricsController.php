<?php

namespace App\Controller;

use App\Repository\EventRepository;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Prometheus metrics for the things Frigate cannot answer.
 *
 * Frigate exposes plenty, but `frigate_camera_events_total` counts only since its own
 * process started, so it cannot tell you how many events or clips you actually have. That
 * lives in this database.
 *
 * Written by hand rather than with a client library: it is four queries and a printf, and
 * the alternative is a dependency plus a registry plus a bundle for a page nobody reads
 * directly.
 *
 * Not behind the JWT firewall -- Prometheus has no session -- so it is gated on the same
 * shared secret the event-bridge uses, and it exposes counts, never content.
 */
#[OA\Tag(name: 'Internal')]
#[Route('/api/internal')]
class MetricsController extends AbstractController
{
    public function __construct(
        private readonly EventRepository $event_repository,
        private readonly string $bridge_secret,
    ) {
    }

    #[OA\Get(
        summary: 'Prometheus metrics: event and clip counts (bridge secret required)',
        responses: [
            new OA\Response(response: 200, description: 'text/plain; version=0.0.4'),
            new OA\Response(response: 401, description: 'Missing or wrong X-Bridge-Secret'),
        ]
    )]
    #[Security(name: null)]
    #[Route('/metrics', name: 'api_internal_metrics', methods: ['GET'])]
    public function metrics(Request $request): Response
    {
        $provided = $request->headers->get('X-Bridge-Secret', '');
        if ($this->bridge_secret === '' || !hash_equals($this->bridge_secret, $provided))
        {
            return new Response('', Response::HTTP_UNAUTHORIZED);
        }

        $rows = $this->event_repository->createQueryBuilder('e')
            ->select('e.camera AS camera, e.label AS label, e.severity AS severity, COUNT(e.id) AS total, SUM(CASE WHEN e.has_clip = true THEN 1 ELSE 0 END) AS clips')
            ->groupBy('e.camera')
            ->addGroupBy('e.label')
            ->addGroupBy('e.severity')
            ->getQuery()
            ->getArrayResult();

        $lines = [
            '# HELP motion_events_total Events mirrored from Frigate, by camera, label and severity.',
            '# TYPE motion_events_total gauge',
        ];
        $clip_lines = [
            '# HELP motion_clips_total Events that have a clip on disk.',
            '# TYPE motion_clips_total gauge',
        ];

        foreach ($rows as $row)
        {
            $labels = sprintf(
                'camera="%s",label="%s",severity="%s"',
                $this->escape((string) $row['camera']),
                $this->escape((string) $row['label']),
                $this->escape((string) ($row['severity'] instanceof \BackedEnum ? $row['severity']->value : $row['severity'])),
            );
            $lines[] = sprintf('motion_events_total{%s} %d', $labels, (int) $row['total']);
            $clip_lines[] = sprintf('motion_clips_total{%s} %d', $labels, (int) $row['clips']);
        }

        $unseen = $this->event_repository->countUnseen();
        $lines[] = '';
        $lines = array_merge($lines, $clip_lines, [
            '',
            '# HELP motion_events_unseen Events not yet marked seen in the app.',
            '# TYPE motion_events_unseen gauge',
            sprintf('motion_events_unseen %d', $unseen),
            '',
        ]);

        return new Response(
            implode("\n", $lines),
            Response::HTTP_OK,
            ['Content-Type' => 'text/plain; version=0.0.4; charset=utf-8'],
        );
    }

    private function escape(string $value): string
    {
        return str_replace(['\\', '"', "\n"], ['\\\\', '\\"', '\\n'], $value);
    }
}
