<?php

namespace App\Security;

use Gesdinet\JWTRefreshTokenBundle\Model\RefreshTokenManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Event\AuthenticationSuccessEvent;
use Lexik\Bundle\JWTAuthenticationBundle\Events;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Component\EventDispatcher\EventDispatcherInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\User\UserProviderInterface;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;

class RefreshTokenAuthenticator extends AbstractAuthenticator
{
    private RefreshTokenManagerInterface $refreshTokenManager;
    private JWTTokenManagerInterface $jwtManager;
    private UserProviderInterface $userProvider;
    private EventDispatcherInterface $dispatcher;

    public function __construct(
        RefreshTokenManagerInterface $refreshTokenManager,
        JWTTokenManagerInterface $jwtManager,
        UserProviderInterface $userProvider,
        EventDispatcherInterface $eventDispatcher
    ) {
        $this->refreshTokenManager = $refreshTokenManager;
        $this->jwtManager = $jwtManager;
        $this->userProvider = $userProvider;
        $this->dispatcher = $eventDispatcher;
    }

    public function supports(Request $request): ?bool
    {
        return $request->attributes->get('_route') === 'gesdinet_jwt_refresh_token';
    }

    public function authenticate(Request $request): \Symfony\Component\Security\Http\Authenticator\Passport\Passport
    {
        $data = json_decode($request->getContent(), true);
        $refreshToken = $data['refresh_token'] ?? null;

        if (!$refreshToken)
        {
            throw new AuthenticationException('No refresh token provided');
        }

        $refreshTokenObject = $this->refreshTokenManager->get($refreshToken);

        if (!$refreshTokenObject || $refreshTokenObject->isValid() === false)
        {
            throw new AuthenticationException('Invalid or expired refresh token');
        }

        $user = $this->userProvider->loadUserByIdentifier($refreshTokenObject->getUsername());

        return new SelfValidatingPassport(new UserBadge($user->getUserIdentifier()));
    }

    public function onAuthenticationSuccess(Request $request, $token, string $firewallName): ?JsonResponse
    {
        $jwt = $this->jwtManager->create($token->getUser());

        $response = new JsonResponse();
        $event = new AuthenticationSuccessEvent(['token' => $jwt], $token->getUser(), $response);
        $this->dispatcher->dispatch($event, Events::AUTHENTICATION_SUCCESS);
        $response->setData($event->getData());
        return $response;
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): JsonResponse
    {
        return new JsonResponse(['error' => $exception->getMessage()], JsonResponse::HTTP_UNAUTHORIZED);
    }
}
