<?php

namespace App\Controller;

use App\Security\JwtCookieAuthenticationSuccessHandler;
use App\Service\MediaTokenService;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * The timeline's own media: HLS playlists for a wall-clock range, their segments, and the
 * preview files the scrubber draws.
 *
 * Same shape as MediaController -- PHP decides, nginx moves the bytes -- and the same two
 * credentials, for the same reason. **An HLS playlist references its segments relatively**,
 * so every request after the first arrives without the signature that fetched the playlist.
 * That is not a quirk to work around here; it is the identical problem the live view
 * already solved, and solving it a second way would mean two things to keep in step.
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

        return $this->serve(sprintf(
            '/_frigate/vod/%s/start/%d/end/%d/%s',
            rawurlencode($camera),
            $start,
            $end,
            $path,
        ));
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
