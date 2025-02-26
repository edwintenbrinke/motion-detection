<?php

namespace App\Controller;

use App\Security\JwtCookieAuthenticationSuccessHandler;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

class AuthenticationController extends AbstractController
{
    #[OA\Tag(name: 'Authentication')]
    #[OA\Response(
        response: 200,
        description: 'Logs out the user successfully and clears authentication cookies.',
        content: new OA\JsonContent(
            properties: [
                new OA\Property(property: 'message', type: 'string', example: 'Logged out successfully')
            ],
            type: 'object'
        )
    )]
    #[Route('/api/logout', name: 'api_logout', methods: ['POST'])]
    public function logout(): JsonResponse
    {
        $response = new JsonResponse(['message' => 'Logged out successfully']);

        $response->headers->clearCookie(JwtCookieAuthenticationSuccessHandler::AUTH_COOKIE);
        $response->headers->clearCookie(JwtCookieAuthenticationSuccessHandler::USERNAME_COOKIE);

        return $response;
    }
}
