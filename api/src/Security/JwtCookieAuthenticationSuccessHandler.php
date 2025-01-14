<?php

// src/Security/JwtCookieAuthenticationSuccessHandler.php
namespace App\Security;

use Lexik\Bundle\JWTAuthenticationBundle\Event\AuthenticationSuccessEvent;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Http\Authentication\AuthenticationSuccessHandlerInterface;
use Symfony\Component\HttpFoundation\Request;

class JwtCookieAuthenticationSuccessHandler implements AuthenticationSuccessHandlerInterface
{
    const AUTH_COOKIE = 'auth_token';
    const USERNAME_COOKIE = 'username';
    public function __construct(
        private readonly JWTTokenManagerInterface $jwt_manager,
    ) {
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token): Response
    {
        $user = $token->getUser();
        $jwt = $this->jwt_manager->create($user);

        // Create the HTTP-only cookie for JWT
        $jwtCookie = Cookie::create(
            self::AUTH_COOKIE,
            $jwt,
            time() + 3600, // 1 hour expiration
            '/',          // Path
            null,         // Domain, null = current domain
            true,         // Secure (HTTPS only)
            true,         // HTTP only
            false,        // Raw
            Cookie::SAMESITE_STRICT // CSRF protection
        );

        // Create non-HTTP-only cookie for username
        $usernameCookie = Cookie::create(
            self::USERNAME_COOKIE,
            $user->getUserIdentifier(),
            time() + 3600,
            '/',
            null,
            true,
            false,  // Not HTTP only
            false,
            Cookie::SAMESITE_STRICT
        );

        $response = new JsonResponse([
            'message' => 'Authentication successful',
            'token' => 'Bearer ' . $jwt,
        ]);

        $response->headers->setCookie($jwtCookie);
        $response->headers->setCookie($usernameCookie);

        return $response;
    }
}