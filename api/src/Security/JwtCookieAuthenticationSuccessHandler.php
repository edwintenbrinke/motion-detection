<?php

// src/Security/JwtCookieAuthenticationSuccessHandler.php

namespace App\Security;

use App\Entity\RefreshToken;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Event\AuthenticationSuccessEvent;
use Lexik\Bundle\JWTAuthenticationBundle\Events;
use Lexik\Bundle\JWTAuthenticationBundle\Response\JWTAuthenticationSuccessResponse;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Http\Authentication\AuthenticationSuccessHandlerInterface;
use Symfony\Contracts\EventDispatcher\EventDispatcherInterface;

class JwtCookieAuthenticationSuccessHandler implements AuthenticationSuccessHandlerInterface
{
    public const AUTH_COOKIE = 'auth_token';
    public const USERNAME_COOKIE = 'username';

    public function __construct(
        private readonly JWTTokenManagerInterface $jwt_manager,
        private readonly EventDispatcherInterface $dispatcher,
        private readonly EntityManagerInterface $manager
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
            Cookie::SAMESITE_NONE // CSRF protection
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
            Cookie::SAMESITE_NONE
        );

        $response = new JWTAuthenticationSuccessResponse($jwt, [], [$jwtCookie]);

        $event = new AuthenticationSuccessEvent(['token' => $jwt], $user, $response);
        $this->dispatcher->dispatch($event, Events::AUTHENTICATION_SUCCESS);

        $event_data = $event->getData();
        $response->setData($event_data);

        $this->manager->createQueryBuilder()
            ->from(RefreshToken::class, 'r')
            ->delete()
            ->where('r.username = :username')
            ->andWhere('r.refreshToken != :refresh_token')
            ->setParameter('username', $user->getUsername())
            ->setParameter('refresh_token', $event_data['refresh_token'])
            ->getQuery()
            ->execute();

        return $response;
    }
}
