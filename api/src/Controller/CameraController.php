<?php

namespace App\Controller;

use App\Service\FrigateClient;
use App\Service\MediaTokenService;
use OpenApi\Attributes as OA;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * HANDOFF H2 and H3: what cameras exist, and how to watch one live.
 */
#[Route('/api/cameras')]
class CameraController extends AbstractController
{
    public function __construct(
        private readonly FrigateClient $frigate_client,
        private readonly MediaTokenService $media_token_service,
        private readonly string $webrtc_lan_url,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[OA\Get(
        summary: 'Cameras Frigate is running, with detect resolution and retention',
        responses: [new OA\Response(response: 200, description: 'Camera list')]
    )]
    #[Route('', name: 'api_cameras_list', methods: ['GET'])]
    public function list(): Response
    {
        try
        {
            return $this->json($this->frigate_client->cameras());
        }
        catch (\Throwable $e)
        {
            // A camera list the app cannot get is a blank screen; a stale one is a screen
            // that mostly works. Neither is worth a 500 that logs nothing.
            $this->logger->error('Could not read cameras from Frigate: ' . $e->getMessage());

            return $this->json(['message' => 'Camera service unavailable'], Response::HTTP_SERVICE_UNAVAILABLE);
        }
    }

    /**
     * The live ladder, ordered best-first, exactly as docs/v2/02-video-transport.md
     * describes it. The app walks the list and falls to the next rung when no frame has
     * arrived in ~3 seconds.
     *
     * Two things here are deliberate and easy to get wrong:
     *
     *  - **The token is in the query string, not a header.** A WebSocket constructor and an
     *    <img> cannot set headers. This is the same reasoning as the media tokens.
     *  - **WebRTC points at the LAN address, not this hostname.** WebRTC needs UDP/ICE and
     *    will not negotiate through the Cloudflare Tunnel (adr/0004). On the LAN the app
     *    reaches go2rtc directly and gets ~0.2 s; from outside that rung simply fails and
     *    the ladder drops to MSE at ~1 s, which is the expected remote behaviour rather
     *    than a fault.
     */
    #[OA\Get(
        summary: 'Ordered live-view fallback ladder for one camera',
        responses: [
            new OA\Response(response: 200, description: 'Rungs, best first'),
            new OA\Response(response: 404, description: 'No such camera'),
        ]
    )]
    #[Route('/{camera}/live', name: 'api_cameras_live', methods: ['GET'])]
    public function live(string $camera): Response
    {
        $known = array_column($this->safeCameras(), 'name');
        if ($known !== [] && !in_array($camera, $known, true))
        {
            return $this->json(['message' => 'No such camera'], Response::HTTP_NOT_FOUND);
        }

        $now = time();
        $token = $this->media_token_service->sign('live', $camera, $now);
        $query = sprintf('exp=%d&sig=%s', $token['exp'], $token['sig']);
        $name = rawurlencode($camera);

        $rungs = [];

        // Rung 1 -- WebRTC, LAN only. Omitted entirely when no LAN address is configured,
        // so the app does not spend three seconds failing over something that cannot work.
        if ($this->webrtc_lan_url !== '')
        {
            $rungs[] = [
                'type' => 'webrtc',
                'url' => sprintf('%s/api/webrtc?src=%s', rtrim($this->webrtc_lan_url, '/'), $name),
                'lan_only' => true,
                'expected_latency_ms' => 200,
            ];
        }

        // Rung 2 -- MSE over WebSocket, through this origin. nginx proxies /api/live/ to
        // go2rtc after checking the signature; PHP never sees these frames. Under /api/
        // deliberately: the SPA has its own /live route, and a shared prefix breaks the
        // moment someone reloads on that page.
        $rungs[] = [
            'type' => 'mse',
            'url' => sprintf('/api/live/api/ws?src=%s&%s', $name, $query),
            'lan_only' => false,
            'expected_latency_ms' => 1000,
        ];

        // Rung 3 -- LL-HLS, for networks that block WebSockets.
        $rungs[] = [
            'type' => 'hls',
            'url' => sprintf('/api/live/api/stream.m3u8?src=%s&%s', $name, $query),
            'lan_only' => false,
            'expected_latency_ms' => 3000,
        ];

        // Rung 4 -- a still every second. Not live video, but never a blank screen, and
        // it is also what the zone editor draws on.
        $rungs[] = [
            'type' => 'snapshot',
            'url' => sprintf('/api/live/api/frame.jpeg?src=%s&%s', $name, $query),
            'lan_only' => false,
            'expected_latency_ms' => 1000,
        ];

        return $this->json([
            'camera' => $camera,
            'expires_at' => (new \DateTimeImmutable('@' . $token['exp']))
                ->setTimezone(new \DateTimeZone('UTC'))
                ->format(\DateTimeInterface::ATOM),
            'rungs' => $rungs,
        ]);
    }

    #[OA\Get(
        summary: 'Current frame for a camera, for thumbnails and the zone editor canvas',
        responses: [new OA\Response(response: 200, description: 'JPEG')]
    )]
    #[Route('/{camera}/snapshot.jpg', name: 'api_cameras_snapshot', methods: ['GET'])]
    public function snapshot(string $camera): Response
    {
        $response = new Response('', Response::HTTP_OK);
        $response->headers->set(
            'X-Accel-Redirect',
            sprintf('/_frigate/api/%s/latest.jpg', rawurlencode($camera)),
        );
        $response->headers->remove('Content-Type');
        // A live frame; caching it is the one thing that would make it not live.
        $response->headers->set('Cache-Control', 'no-store');

        return $response;
    }

    /**
     * @return list<array{name: string, ...}>
     */
    private function safeCameras(): array
    {
        try
        {
            return $this->frigate_client->cameras();
        }
        catch (\Throwable)
        {
            // Frigate being briefly unreachable should not make a valid camera name look
            // invalid -- fall through to serving the ladder and let the rungs fail loudly.
            return [];
        }
    }
}
