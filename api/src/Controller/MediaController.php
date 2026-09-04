<?php

namespace App\Controller;

use App\Security\JwtCookieAuthenticationSuccessHandler;
use App\Repository\EventRepository;
use App\Service\FrigateClient;
use App\Service\MediaTokenService;
use App\Service\MediaUrlBuilder;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Serves event media -- thumbnails, snapshots and clips -- to consumers that cannot send
 * an Authorization header: <img src>, <video src>, and Android's notification-image
 * fetcher. Authentication is the signature in the query string instead.
 *
 * PHP verifies; nginx transfers. The response carries an X-Accel-Redirect and no body, so
 * a clip never passes through a PHP worker, and Range is forwarded rather than swallowed.
 * (Frigate itself answers 200 to a ranged GET on clip.mp4, so seeking within an event clip
 * still re-downloads -- an upstream limit, not one introduced here.)
 * See docker/prod/nginx-api.conf.template.
 *
 * This route is PUBLIC_ACCESS at the firewall (security.yaml) because a signed URL is the
 * credential. Everything inside is gated on that signature; do not add a route under
 * /api/media that does not verify one.
 */
#[Route('/api/media')]
class MediaController extends AbstractController
{
    private const KINDS = ['thumbnail', 'snapshot', 'clip'];
    private const KIND_CLIP_RANGE_CHECK = 'clip';

    public function __construct(
        private readonly MediaTokenService $media_token_service,
        private readonly FrigateClient $frigate_client,
        private readonly JWTTokenManagerInterface $jwt_manager,
        private readonly EventRepository $event_repository,
        private readonly MediaUrlBuilder $media_url_builder,
    ) {
    }

    /**
     * nginx's auth_request target for /live/. nginx cannot compute an HMAC, so it asks
     * here: 204 and it proxies the WebSocket or HLS playlist through to go2rtc, 403 and
     * the connection never reaches it. Only the headers matter -- the body is discarded.
     *
     * Signed against ('live', <camera>), which is what CameraController::live() issues.
     */
    #[Security(name: null)]
    #[Route('/_live-auth', name: 'api_media_live_auth', methods: ['GET'])]
    public function liveAuth(Request $request): Response
    {
        // nginx sends the original request line in a header rather than as a query on the
        // subrequest, because an auth_request subrequest has its own (empty) argument
        // list. Falling back to the real query keeps this endpoint testable with a plain
        // curl, which is how the difference between "wrong signature" and "no signature
        // arrived" gets diagnosed at all.
        $query = [];
        $original_uri = $request->headers->get('X-Original-URI');
        if (is_string($original_uri) && str_contains($original_uri, '?'))
        {
            parse_str(substr($original_uri, strpos($original_uri, '?') + 1), $query);
        }

        $camera = (string) ($query['src'] ?? $request->query->get('src', ''));
        $exp = (int) ($query['exp'] ?? $request->query->getInt('exp'));
        $sig = (string) ($query['sig'] ?? $request->query->get('sig', ''));

        if ($camera !== '' && $exp !== 0 && $sig !== '' && $this->media_token_service->verify('live', $camera, $exp, $sig))
        {
            return new Response('', Response::HTTP_NO_CONTENT);
        }

        // A signature is not the only way in, and it cannot be: go2rtc's HLS playlist
        // points at its segments with *relative* URLs, so every follow-up request the
        // player makes arrives without the exp/sig that got it the playlist. Signing the
        // playlist body would mean rewriting HLS on the way through.
        //
        // The session cookie covers those, and only those, because the app and the API
        // share one origin -- so the player sends it automatically. This is not a
        // weakening: a valid session is a stronger credential than a ten-minute link.
        // The signature exists for the cases that cannot carry a cookie at all.
        if ($this->hasValidSession($request))
        {
            return new Response('', Response::HTTP_NO_CONTENT);
        }

        return new Response('', Response::HTTP_FORBIDDEN);
    }

    /**
     * The JWT cookie, checked by hand because this route is PUBLIC_ACCESS at the firewall
     * -- it has to be, or a signed link without a session would never reach the code that
     * validates the signature.
     */
    private function hasValidSession(Request $request): bool
    {
        $token = $request->cookies->get(JwtCookieAuthenticationSuccessHandler::AUTH_COOKIE);
        if (!is_string($token) || $token === '')
        {
            return false;
        }

        try
        {
            // parse() verifies signature and expiry and throws on either.
            return $this->jwt_manager->parse($token) !== [];
        }
        catch (\Throwable)
        {
            return false;
        }
    }

    #[OA\Get(
        summary: 'Signed media for one event. No session required; the signature is the credential.',
        responses: [
            new OA\Response(response: 200, description: 'The bytes, streamed by nginx'),
            new OA\Response(response: 403, description: 'Missing, expired or forged signature'),
            new OA\Response(response: 404, description: 'Unknown media kind'),
        ]
    )]
    #[Security(name: null)]
    #[Route('/{kind}/{id}', name: 'api_media_get', methods: ['GET'], requirements: ['kind' => 'thumbnail|snapshot|clip'])]
    public function get(string $kind, string $id, Request $request): Response
    {
        if (!in_array($kind, self::KINDS, true))
        {
            return $this->json(['message' => 'Unknown media kind'], Response::HTTP_NOT_FOUND);
        }

        $exp = $request->query->getInt('exp');
        $sig = (string) $request->query->get('sig', '');

        if ($exp === 0 || $sig === '' || !$this->media_token_service->verify($kind, $id, $exp, $sig))
        {
            // One message for expired, forged and missing alike: telling them apart tells
            // an attacker which half they got right.
            return $this->json(['message' => 'Invalid or expired media link'], Response::HTTP_FORBIDDEN);
        }

        // A clip is served from the padded time range rather than the bare event, so you
        // see the approach and not just the arrival. The event has to exist locally for
        // that -- without its start and end there is no range to ask for, and the
        // unpadded event endpoint is the correct fallback rather than an error.
        $range = null;
        if ($kind === self::KIND_CLIP_RANGE_CHECK)
        {
            $event = $this->event_repository->find($id);
            $range = $event !== null ? $this->media_url_builder->clipRange($event) : null;
        }

        $upstream_path = $this->frigate_client->eventMediaPath($kind, $id, $range);
        if ($upstream_path === null)
        {
            return $this->json(['message' => 'Unknown media kind'], Response::HTTP_NOT_FOUND);
        }

        $response = new Response('', Response::HTTP_OK);
        // The /_frigate/ prefix is an internal nginx location -- not routable from outside.
        $response->headers->set('X-Accel-Redirect', '/_frigate' . $upstream_path);
        $response->headers->set('X-Accel-Buffering', 'no');
        // Let nginx and Frigate decide the type; guessing it here would only be wrong.
        $response->headers->remove('Content-Type');
        // Signed URLs are already time-boxed. Caching them privately for their remaining
        // life saves the feed re-fetching the same thumbnails on every scroll.
        $ttl = max(0, $exp - time());
        $response->headers->set('Cache-Control', sprintf('private, max-age=%d', $ttl));

        return $response;
    }
}
