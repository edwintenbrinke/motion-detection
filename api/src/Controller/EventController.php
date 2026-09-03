<?php

declare(strict_types=1);

namespace App\Controller;

use App\DTO\Event\EventFeedbackInputDTO;
use App\DTO\Event\EventOutputDTO;
use App\Entity\Event;
use App\Repository\EventRepository;
use App\Service\MediaUrlBuilder;
use App\Trait\ValidationTrait;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * The app-facing event feed. See docs/v2/07-api-and-data-model.md#events. This replaces
 * the calendar/hour endpoints on MotionDetectedFileController for anything driven by
 * Frigate -- the old ones stay for the frozen v1 archive (see docs/v2/07, "Archive").
 */
#[OA\Tag(name: 'Events')]
#[Route('/api/events')]
class EventController extends AbstractController
{
    use ValidationTrait;

    public function __construct(private readonly MediaUrlBuilder $media_url_builder)
    {
    }

    #[OA\Get(
        summary: 'Cursor-paginated event feed, newest first',
        responses: [
            new OA\Response(response: 200, description: 'A page of events plus the cursor for the next page'),
        ]
    )]
    #[Route('', name: 'api_events_list', methods: ['GET'])]
    public function list(Request $request, EventRepository $event_repository): Response
    {
        $limit = min(100, max(1, (int) $request->query->get('limit', '25')));
        $cursor = $request->query->get('cursor');
        $cameras = $this->queryArray($request, 'cameras');
        $labels = $this->queryArray($request, 'labels');
        $zones = $this->queryArray($request, 'zones');
        $severity = $request->query->get('severity');

        // A page of limit+1 tells us whether there's a next page without a second query.
        $events = $event_repository->findFeed($limit + 1, $cursor, $cameras, $labels, $zones, $severity);

        $has_more = count($events) > $limit;
        $events = array_slice($events, 0, $limit);

        $next_cursor = null;
        if ($has_more && $events !== [])
        {
            $last = $events[count($events) - 1];
            $next_cursor = base64_encode($last->getStartedAt()->format(\DateTimeInterface::ATOM) . '|' . $last->getId());
        }

        $now = time();

        return $this->json([
            'events' => array_map(fn (Event $event) => $this->toOutputDTO($event, $now), $events),
            'next_cursor' => $next_cursor,
        ]);
    }

    #[OA\Get(
        summary: 'Number of unseen events',
        responses: [new OA\Response(response: 200, description: 'Unseen count')]
    )]
    #[Route('/unread-count', name: 'api_events_unread_count', methods: ['GET'])]
    public function unreadCount(EventRepository $event_repository): Response
    {
        return $this->json(['count' => $event_repository->countUnseen()]);
    }

    #[OA\Get(
        summary: 'One event',
        responses: [
            new OA\Response(response: 200, description: 'Event detail'),
            new OA\Response(response: 404, description: 'Not found'),
        ]
    )]
    #[Route('/{id}', name: 'api_events_get', methods: ['GET'])]
    public function get(Event $event): Response
    {
        return $this->json($this->toOutputDTO($event));
    }

    #[OA\Post(
        summary: 'Mark an event as seen',
        responses: [new OA\Response(response: 200, description: 'Marked seen')]
    )]
    #[Route('/{id}/seen', name: 'api_events_seen', methods: ['POST'])]
    public function markSeen(Event $event, EntityManagerInterface $entity_manager): Response
    {
        $event->setSeen(true);
        $entity_manager->flush();

        return $this->json(['message' => 'Marked seen']);
    }

    #[OA\Post(
        summary: 'Flag an event as mislabeled ("dit klopt niet")',
        responses: [new OA\Response(response: 200, description: 'Feedback recorded')]
    )]
    #[Route('/{id}/feedback', name: 'api_events_feedback', methods: ['POST'])]
    public function feedback(Request $request, Event $event, EntityManagerInterface $entity_manager): Response
    {
        $dto = $this->validateRequest($request, EventFeedbackInputDTO::class);
        if ($dto instanceof JsonResponse)
        {
            return $dto;
        }

        $event->setFeedback($dto->getFeedback());
        $entity_manager->flush();

        // Not yet wired into anything: this is meant to feed the layer-3 classifier's
        // training set later. See docs/v2/03-detection-and-ai.md#layer-3 and
        // docs/v2/HANDOFF.md.
        return $this->json(['message' => 'Feedback recorded']);
    }

    /**
     * Reads a repeatable query parameter as a list.
     *
     * Accepts both `?labels[]=person&labels[]=car` and the plain `?labels=person`.
     * InputBag::all() throws a BadRequestException on the second form, which would turn
     * a reasonable request into an opaque 400, so the scalar case is handled explicitly.
     *
     * @return list<string>
     */
    private function queryArray(Request $request, string $key): array
    {
        if (!$request->query->has($key))
        {
            return [];
        }

        $value = $request->query->all()[$key];
        if (!is_array($value))
        {
            $value = [$value];
        }

        // Drop anything that isn't a plain scalar (`?labels[][]=x` nests one level
        // deeper) rather than letting strval() turn it into the string "Array".
        $scalars = array_filter($value, static fn (mixed $item) => is_scalar($item));

        return array_values(array_filter(array_map('strval', $scalars), static fn (string $item) => $item !== ''));
    }

    /**
     * @param int|null $now Passed through so every event in one page is signed against the
     *                      same instant: a feed whose rows expire at slightly different
     *                      times refreshes in a trickle instead of once.
     */
    private function toOutputDTO(Event $event, ?int $now = null): EventOutputDTO
    {
        return new EventOutputDTO(
            id: $event->getId(),
            camera: $event->getCamera(),
            severity: $event->getSeverity()->value,
            label: $event->getLabel(),
            sub_label: $event->getSubLabel(),
            zones: $event->getZones(),
            derived_tags: $event->getDerivedTags(),
            top_score: $event->getTopScore(),
            started_at: $event->getStartedAt()->format(\DateTimeInterface::ATOM),
            ended_at: $event->getEndedAt()?->format(\DateTimeInterface::ATOM),
            has_clip: $event->hasClip(),
            has_snapshot: $event->hasSnapshot(),
            title: $event->getTitle(),
            description: $event->getDescription(),
            genai_severity: $event->getGenaiSeverity(),
            seen: $event->isSeen(),
            media: $this->media_url_builder->forEvent($event, $now),
        );
    }
}
