<?php

namespace App\Controller;

use App\Security\JwtCookieAuthenticationSuccessHandler;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

class AuthenticationController extends AbstractController
{
    #[Route('/api/logout', name: 'api_logout', methods: ['GET', 'POST'])]
    public function logout(): JsonResponse
    {
        $response = new JsonResponse(['message' => 'Logged out successfully']);

        $response->headers->clearCookie(JwtCookieAuthenticationSuccessHandler::AUTH_COOKIE);
        $response->headers->clearCookie(JwtCookieAuthenticationSuccessHandler::USERNAME_COOKIE);

        return $response;
    }
}