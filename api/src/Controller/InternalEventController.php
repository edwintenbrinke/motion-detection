<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Event;
use App\Enum\EventSeverityEnum;
use App\Repository\EventRepository;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Receives events from event-bridge (see python/bridge/main.py). Not reached by the app
 * or by JWT auth at all -- see security.yaml, `^/api/internal` is PUBLIC_ACCESS at the
 * firewall level and this controller enforces its own shared-secret check instead. This
 * is deliberate: the bridge has no user session to hold a JWT for, and adding one just to
 * satisfy the general auth firewall would mean provisioning and rotating a fake user
 * account for a machine-to-machine call. See docs/v2/07-api-and-data-model.md#internal.
 *
 * Upserts on Frigate's own review-item id, because the same event arrives more than
 * once -- at "new"/"end", and again whenever GenAI enrichment lands. See Event's class
 * doc and docs/v2/04-notifications.md#the-path.
 */
#[OA\Tag(name: 'Internal')]
#[Route('/api/internal')]
class InternalEventController extends AbstractController
{
    #[OA\Post(
        summary: 'Ingest one Frigate review-item event (event-bridge only)',
        responses: [
            new OA\Response(response: 200, description: 'Accepted'),
            new OA\Response(response: 401, description: 'Missing or wrong X-Bridge-Secret'),
            new OA\Response(response: 400, description: 'Payload missing required fields'),
        ]
    )]
    #[Route('/events', name: 'api_internal_events_post', methods: ['POST'])]
    public function postEvent(
        Request $request,
        EntityManagerInterface $entity_manager,
        EventRepository $event_repository,
        string $bridge_secret,
    ): Response {
        $provided_secret = $request->headers->get('X-Bridge-Secret', '');
        if ($bridge_secret === '' || !hash_equals($bridge_secret, $provided_secret))
        {
            return new JsonResponse(['message' => 'Unauthorized'], Response::HTTP_UNAUTHORIZED);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload))
        {
            return new JsonResponse(['message' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }

        $id = $payload['id'] ?? null;
        $camera = $payload['camera'] ?? null;
        $severity_raw = $payload['severity'] ?? null;
        $started_at_raw = $payload['started_at'] ?? null;
        $labels = $payload['labels'] ?? [];

        if (!is_string($id) || $id === '' || !is_string($camera) || $started_at_raw === null)
        {
            return new JsonResponse(['message' => 'Missing required field: id, camera or started_at'], Response::HTTP_BAD_REQUEST);
        }

        $severity = EventSeverityEnum::tryFrom(is_string($severity_raw) ? $severity_raw : '');
        if ($severity === null)
        {
            return new JsonResponse(['message' => 'severity must be "alert" or "detection"'], Response::HTTP_BAD_REQUEST);
        }

        $started_at = $this->toDateTimeImmutable($started_at_raw);
        if ($started_at === null)
        {
            return new JsonResponse(['message' => 'started_at is not a valid timestamp'], Response::HTTP_BAD_REQUEST);
        }

        $label = is_array($labels) && $labels !== [] ? (string) $labels[0] : 'unknown';

        $event = $event_repository->find($id);
        if ($event === null)
        {
            $event = new Event($id, $camera, $severity, $label, $started_at);
            $entity_manager->persist($event);
        }
        else
        {
            $event->setCamera($camera);
            $event->setSeverity($severity);
            $event->setLabel($label);
            $event->setStartedAt($started_at);
            $event->touch();
        }

        $sub_labels = $payload['sub_labels'] ?? [];
        $event->setSubLabel(is_array($sub_labels) && $sub_labels !== [] ? (string) $sub_labels[0] : null);

        $zones = $payload['zones'] ?? [];
        $event->setZones(is_array($zones) ? array_values(array_map('strval', $zones)) : []);

        if (isset($payload['top_score']) && is_numeric($payload['top_score']))
        {
            $event->setTopScore((float) $payload['top_score']);
        }

        $ended_at_raw = $payload['ended_at'] ?? null;
        if ($ended_at_raw !== null)
        {
            $event->setEndedAt($this->toDateTimeImmutable($ended_at_raw));
        }

        if (isset($payload['has_clip']))
        {
            $event->setHasClip((bool) $payload['has_clip']);
        }
        if (isset($payload['has_snapshot']))
        {
            $event->setHasSnapshot((bool) $payload['has_snapshot']);
        }

        // GenAI fields (layer 4) are not sent by event-bridge yet -- see
        // docs/v2/03-detection-and-ai.md#layer-4. Accepted here already so a future
        // enrichment step can PATCH the same row without a controller change.
        if (isset($payload['title']) && is_string($payload['title']))
        {
            $event->setTitle($payload['title']);
        }
        if (isset($payload['description']) && is_string($payload['description']))
        {
            $event->setDescription($payload['description']);
        }
        if (isset($payload['genai_severity']) && is_string($payload['genai_severity']))
        {
            $event->setGenaiSeverity($payload['genai_severity']);
        }

        $entity_manager->flush();

        return new JsonResponse(['message' => 'Event accepted', 'id' => $event->getId()]);
    }

    private function toDateTimeImmutable(mixed $value): ?\DateTimeImmutable
    {
        try
        {
            if (is_numeric($value))
            {
                return (new \DateTimeImmutable())->setTimestamp((int) $value);
            }
            if (is_string($value))
            {
                return new \DateTimeImmutable($value);
            }
        }
        catch (\Exception)
        {
            return null;
        }

        return null;
    }
}
