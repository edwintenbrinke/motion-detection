<?php

namespace App\Controller;

use App\Service\FrigateClient;
use OpenApi\Attributes as OA;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Zones and motion masks (HANDOFF H9).
 *
 * These are the highest-value settings in the whole application and the reason Phase 6 is
 * survivable: with nothing drawn, every person anywhere in frame is an alert, and a
 * notification system built on that teaches you to ignore it within a week.
 *
 * Frigate owns the config file (ADR 0005), so this reads and writes through Frigate's own
 * API rather than touching the PVC. That also means Frigate validates the polygon before it
 * is stored, and its UI and this app can never disagree about what is drawn.
 */
#[OA\Tag(name: 'Cameras')]
#[Route('/api/cameras/{camera}')]
class CameraZonesController extends AbstractController
{
    public function __construct(
        private readonly FrigateClient $frigate_client,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[OA\Get(
        summary: 'Zones for one camera, as normalised polygons',
        responses: [new OA\Response(response: 200, description: 'Zones')]
    )]
    #[Route('/zones', name: 'api_cameras_zones_get', methods: ['GET'])]
    public function getZones(string $camera): Response
    {
        return $this->shapes($camera, 'zones');
    }

    #[OA\Get(
        summary: 'Motion masks for one camera, as normalised polygons',
        responses: [new OA\Response(response: 200, description: 'Masks')]
    )]
    #[Route('/masks', name: 'api_cameras_masks_get', methods: ['GET'])]
    public function getMasks(string $camera): Response
    {
        return $this->shapes($camera, 'masks');
    }

    /**
     * Replaces the whole set. Not a patch: the editor works on the complete picture, and a
     * partial update has no way to express "this zone is gone".
     *
     * A zone dropped from the list is removed by writing an empty coordinate string, which
     * is how Frigate's own editor deletes one -- `config/set` edits keys in place and has
     * no delete, and the alternative (rewriting the whole YAML) would strip every comment
     * out of a file whose comments are the documentation.
     */
    #[OA\Put(
        summary: 'Replace the zones for one camera',
        responses: [
            new OA\Response(response: 204, description: 'Stored; Frigate has reloaded'),
            new OA\Response(response: 400, description: 'A polygon was not usable'),
            new OA\Response(response: 502, description: 'Frigate refused the change'),
        ]
    )]
    #[Route('/zones', name: 'api_cameras_zones_put', methods: ['PUT'])]
    public function putZones(string $camera, Request $request): Response
    {
        $payload = json_decode($request->getContent(), true);
        $zones = $payload['zones'] ?? null;

        if (!is_array($zones))
        {
            return $this->json(['message' => 'Verwacht {"zones": [...]}'], Response::HTTP_BAD_REQUEST);
        }

        $built = [];
        foreach ($zones as $zone)
        {
            $name = $this->slug((string) ($zone['name'] ?? ''));
            $points = $zone['points'] ?? [];

            if ($name === '')
            {
                return $this->json(['message' => 'Elke zone heeft een naam nodig'], Response::HTTP_BAD_REQUEST);
            }

            // Three points is the minimum that encloses anything. Frigate would accept
            // fewer and then never match, which reads as "zones do not work".
            if (!is_array($points) || count($points) < 3)
            {
                return $this->json(
                    ['message' => sprintf('Zone "%s" heeft minstens drie punten nodig', $name)],
                    Response::HTTP_BAD_REQUEST,
                );
            }

            $entry = ['coordinates' => FrigateClient::encodePolygon($points)];

            if (isset($zone['objects']) && is_array($zone['objects']) && $zone['objects'] !== [])
            {
                $entry['objects'] = array_values($zone['objects']);
            }
            if (isset($zone['inertia']) && is_numeric($zone['inertia']))
            {
                $entry['inertia'] = (int) $zone['inertia'];
            }
            if (isset($zone['loitering_time']) && is_numeric($zone['loitering_time']))
            {
                $entry['loitering_time'] = (int) $zone['loitering_time'];
            }

            $built[$name] = $entry;
        }

        return $this->replace($camera, static function (array &$cam) use ($built): void {
            if ($built === [])
            {
                unset($cam['zones']);

                return;
            }

            $cam['zones'] = $built;
        }, sprintf('zones voor %s', $camera));
    }

    #[OA\Put(
        summary: 'Replace the motion masks for one camera',
        responses: [
            new OA\Response(response: 204, description: 'Stored; Frigate has reloaded'),
            new OA\Response(response: 400, description: 'A polygon was not usable'),
            new OA\Response(response: 502, description: 'Frigate refused the change'),
        ]
    )]
    #[Route('/masks', name: 'api_cameras_masks_put', methods: ['PUT'])]
    public function putMasks(string $camera, Request $request): Response
    {
        $payload = json_decode($request->getContent(), true);
        $masks = $payload['masks'] ?? null;

        if (!is_array($masks))
        {
            return $this->json(['message' => 'Verwacht {"masks": [...]}'], Response::HTTP_BAD_REQUEST);
        }

        $encoded = [];
        foreach ($masks as $polygon)
        {
            $points = is_array($polygon) && isset($polygon['points']) ? $polygon['points'] : $polygon;
            if (!is_array($points) || count($points) < 3)
            {
                return $this->json(['message' => 'Elke mask heeft minstens drie punten nodig'], Response::HTTP_BAD_REQUEST);
            }
            $encoded[] = FrigateClient::encodePolygon($points);
        }

        return $this->replace($camera, static function (array &$cam) use ($encoded): void {
            if ($encoded === [])
            {
                unset($cam['motion']['mask']);

                return;
            }

            // Frigate takes one polygon as a string and several as a list.
            $cam['motion']['mask'] = count($encoded) === 1 ? $encoded[0] : $encoded;
        }, sprintf('masks voor %s', $camera));
    }

    private function shapes(string $camera, string $key): Response
    {
        try
        {
            return $this->json([$key => $this->frigate_client->cameraShapes($camera)[$key]]);
        }
        catch (\Throwable $e)
        {
            $this->logger->error(sprintf('Kon %s niet lezen: %s', $key, $e->getMessage()));

            return $this->json(['message' => 'Camera-instellingen niet beschikbaar'], Response::HTTP_SERVICE_UNAVAILABLE);
        }
    }

    /**
     * Applies an edit to one camera in the saved config, then makes Frigate use it.
     *
     * The whole file, not `config/set` per key, because `config/set` can only set: writing
     * an empty value for a removed zone leaves it behind without its required coordinates
     * and Frigate rejects the request outright. Since deleting is half of editing, both
     * halves go the same way rather than two code paths that behave differently.
     *
     * Read from the *saved* config, never the running one -- the running config has every
     * default filled in, and writing that back would bake hundreds of them into the file.
     *
     * @param callable(array<string, mixed> &): void $edit
     */
    private function replace(string $camera, callable $edit, string $what): Response
    {
        try
        {
            $config = $this->frigate_client->rawConfig();

            if (!isset($config['cameras'][$camera]))
            {
                return $this->json(['message' => sprintf('Onbekende camera "%s"', $camera)], Response::HTTP_NOT_FOUND);
            }

            $cam = $config['cameras'][$camera];
            $edit($cam);
            $config['cameras'][$camera] = $cam;

            // save_option=restart: Frigate writes the file and applies it in one step.
            // Saved is not applied -- it keeps serving the old config until it restarts, so
            // a zone stored without this reads back as absent and matches nothing.
            $this->frigate_client->saveConfig($config, 'restart');
        }
        catch (\Throwable $e)
        {
            $this->logger->error(sprintf('Kon %s niet opslaan: %s', $what, $e->getMessage()));

            return $this->json(['message' => 'Frigate weigerde de wijziging'], Response::HTTP_BAD_GATEWAY);
        }

        // 202, not 204: the camera is down for about a minute while Frigate comes back, and
        // the app should be able to say so rather than looking frozen.
        return $this->json([
            'message' => 'Opgeslagen. Frigate herstart om het toe te passen; de camera is ongeveer een minuut weg.',
            'restarting' => true,
        ], Response::HTTP_ACCEPTED);
    }

    /**
     * Frigate uses the zone name as a config key and as the value in an event's `zones`
     * array, so it has to survive both. Anything outside this set would either break the
     * dotted path in `config/set` or come back mangled in the feed.
     */
    private function slug(string $name): string
    {
        $slug = strtolower(trim($name));
        $slug = preg_replace('/[^a-z0-9_]+/', '_', $slug) ?? '';

        return trim($slug, '_');
    }
}
