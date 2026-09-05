<?php

namespace App\Controller;

use App\Security\JwtCookieAuthenticationSuccessHandler;
use App\Service\FrigateClient;
use App\Service\MediaTokenService;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * The timeline's own media: HLS playlists for a wall-clock range, their segments, and the
 * preview files the scrubber draws.
 *
 * Same shape as MediaController -- PHP decides, nginx moves the bytes -- with one
 * exception, and it is the whole reason this file is interesting.
 *
 * **An HLS playlist references its segments relatively, and a relative URL drops the query
 * string.** So every segment request after the playlist arrives with no `exp` and no `sig`.
 * This used to lean on the session cookie for those, the way the live view does, and that
 * reasoning does not survive contact with this deployment: the app is served from
 * `motion.` and the API from `api.`, so every media request is cross-origin, and hls.js
 * fetches segments over XHR without `withCredentials`. The cookie is never sent. The
 * Capacitor build has no cookie for this origin at all.
 *
 * So the playlist -- and only the playlist -- is read by PHP and handed back with the
 * signature appended to every URI it names. It is a few kilobytes of text and it is the
 * one response in this path that is a *decision* rather than bytes. Segments still go out
 * through X-Accel-Redirect, untouched, gated on the signature they now carry.
 * See docs/v2/13-timeline-and-players.md#a2.
 *
 * PUBLIC_ACCESS at the firewall (security.yaml), gated on the signature or the session
 * inside. Do not add a route under /api/timeline that checks neither.
 */
#[OA\Tag(name: 'Cameras')]
#[Route('/api/timeline')]
class TimelineMediaController extends AbstractController
{
    public function __construct(
        private readonly MediaTokenService $media_token_service,
        private readonly JWTTokenManagerInterface $jwt_manager,
        private readonly FrigateClient $frigate_client,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * An HLS playlist for a range, and every segment it points at.
     *
     * `{path}` is greedy on purpose: the playlist names its segments relative to itself, so
     * they land back here with the same prefix and are served the same way.
     */
    #[OA\Get(
        summary: 'HLS for a wall-clock range on one camera',
        responses: [
            new OA\Response(response: 200, description: 'Playlist or segment, streamed by nginx'),
            new OA\Response(response: 403, description: 'No valid signature and no session'),
        ]
    )]
    #[Security(name: null)]
    #[Route(
        '/{camera}/vod/{start}/{end}/{path}',
        name: 'api_timeline_vod',
        methods: ['GET'],
        requirements: ['start' => '\d+', 'end' => '\d+', 'path' => '.+'],
    )]
    public function vod(string $camera, int $start, int $end, string $path, Request $request): Response
    {
        if (!$this->allowed($camera, $request))
        {
            return $this->json(['message' => 'Invalid or expired link'], Response::HTTP_FORBIDDEN);
        }

        $upstream = sprintf(
            '/vod/%s/start/%d/end/%d/%s',
            rawurlencode($camera),
            $start,
            $end,
            $path,
        );

        if (str_ends_with($path, '.m3u8'))
        {
            return $this->playlist($upstream, $camera);
        }

        return $this->serve('/_frigate' . $upstream);
    }

    /**
     * The playlist, with a fresh signature appended to every URI it names.
     *
     * A *fresh* one rather than the caller's, on purpose: this route also accepts a session
     * cookie, and a playlist fetched that way would otherwise hand out unsigned segment
     * URLs -- which is exactly the state that made this method necessary.
     */
    private function playlist(string $upstream, string $camera): Response
    {
        try
        {
            $body = $this->frigate_client->fetchText($upstream);
        }
        catch (\Throwable $e)
        {
            $this->logger->error('Playlist kon niet worden opgehaald: ' . $e->getMessage());

            return $this->json(['message' => 'Opname niet beschikbaar'], Response::HTTP_SERVICE_UNAVAILABLE);
        }

        $token = $this->media_token_service->sign('timeline', $camera, null, MediaTokenService::TIMELINE_TTL_S);
        $query = sprintf('exp=%d&sig=%s', $token['exp'], $token['sig']);

        $response = new Response($this->signUris($body, $query), Response::HTTP_OK);
        $response->headers->set('Content-Type', 'application/vnd.apple.mpegurl');
        // Never cache this: the signature inside it expires, and a cached playlist would
        // keep handing out dead segment URLs long after a fresh one would have worked.
        $response->headers->set('Cache-Control', 'private, no-store');

        return $response;
    }

    /**
     * Append `$query` to every URI in an HLS playlist.
     *
     * Two kinds of URI live in one: a bare line (a segment, or a media playlist named by a
     * master playlist), and a `URI="..."` attribute on a tag -- EXT-X-MAP for the fMP4
     * init segment, EXT-X-KEY, EXT-X-MEDIA. Missing the second kind gives you a playlist
     * that plays for exactly zero seconds because the init segment 403s.
     */
    private function signUris(string $body, string $query): string
    {
        $lines = preg_split('/\R/', $body) ?: [];

        foreach ($lines as $index => $line)
        {
            $trimmed = trim($line);

            if ($trimmed === '')
            {
                continue;
            }

            if (!str_starts_with($trimmed, '#'))
            {
                $lines[$index] = $this->appendQuery($trimmed, $query);
                continue;
            }

            $lines[$index] = preg_replace_callback(
                '/URI="([^"]*)"/',
                fn (array $matches): string => 'URI="' . $this->appendQuery($matches[1], $query) . '"',
                $trimmed,
            );
        }

        return implode("\n", $lines);
    }

    private function appendQuery(string $uri, string $query): string
    {
        // An absolute URL is not ours to sign, and appending our signature to someone
        // else's host would leak it. Frigate's VOD module emits relative names.
        if ($uri === '' || preg_match('#^[a-z][a-z0-9+.-]*:#i', $uri) === 1)
        {
            return $uri;
        }

        return $uri . (str_contains($uri, '?') ? '&' : '?') . $query;
    }

    /**
     * A preview file, at the path Frigate itself reported.
     *
     * Constrained to `clips/previews/` and normalised first: this takes a path from an
     * upstream response and hands it to nginx, which is exactly the shape of a traversal
     * bug if it is taken on trust.
     */
    #[OA\Get(
        summary: 'One preview file for the scrubber',
        responses: [
            new OA\Response(response: 200, description: 'The file, streamed by nginx'),
            new OA\Response(response: 403, description: 'No valid signature and no session'),
            new OA\Response(response: 404, description: 'Not a preview path'),
        ]
    )]
    #[Security(name: null)]
    // Not `file()`: AbstractController already has one, with an incompatible signature, and
    // overriding it is a compile error that takes the whole application down rather than
    // just this route.
    #[Route('/file/{path}', name: 'api_timeline_file', methods: ['GET'], requirements: ['path' => '.+'])]
    public function previewFile(string $path, Request $request): Response
    {
        // The signature is issued per camera, and a preview path names its camera. Checking
        // any valid timeline signature would let one camera's link fetch another's file.
        $camera = $this->cameraFromPreviewPath($path);

        if ($camera === null || !$this->allowed($camera, $request))
        {
            return $this->json(['message' => 'Invalid or expired link'], Response::HTTP_FORBIDDEN);
        }

        return $this->serve('/_frigate/' . ltrim($path, '/'));
    }

    private function serve(string $upstream): Response
    {
        $response = new Response('', Response::HTTP_OK);
        $response->headers->set('X-Accel-Redirect', $upstream);
        $response->headers->remove('Content-Type');
        // Segments and previews are immutable once written, and a scrubber re-requests the
        // same ones constantly while dragging.
        $response->headers->set('Cache-Control', 'private, max-age=300');

        return $response;
    }

    private function allowed(string $camera, Request $request): bool
    {
        $exp = $request->query->getInt('exp');
        $sig = (string) $request->query->get('sig', '');

        if ($exp !== 0 && $sig !== '' && $this->media_token_service->verify('timeline', $camera, $exp, $sig))
        {
            return true;
        }

        return $this->hasValidSession($request);
    }

    private function hasValidSession(Request $request): bool
    {
        $token = $request->cookies->get(JwtCookieAuthenticationSuccessHandler::AUTH_COOKIE);
        if (!is_string($token) || $token === '')
        {
            return false;
        }

        try
        {
            return $this->jwt_manager->parse($token) !== [];
        }
        catch (\Throwable)
        {
            return false;
        }
    }

    /**
     * `clips/previews/<camera>/<file>.mp4` and nothing else.
     */
    private function cameraFromPreviewPath(string $path): ?string
    {
        $clean = ltrim($path, '/');

        if (str_contains($clean, '..') || str_contains($clean, '//'))
        {
            return null;
        }

        if (preg_match('#^clips/previews/([A-Za-z0-9_-]+)/[A-Za-z0-9._-]+$#', $clean, $matches) !== 1)
        {
            return null;
        }

        return $matches[1];
    }
}
