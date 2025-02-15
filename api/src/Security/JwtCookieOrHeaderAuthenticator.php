<?php

namespace App\Security;

use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTAuthenticatedEvent;
use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTExpiredEvent;
use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTInvalidEvent;
use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTNotFoundEvent;
use Lexik\Bundle\JWTAuthenticationBundle\Events;
use Lexik\Bundle\JWTAuthenticationBundle\Exception\ExpiredTokenException;
use Lexik\Bundle\JWTAuthenticationBundle\Exception\InvalidPayloadException;
use Lexik\Bundle\JWTAuthenticationBundle\Exception\InvalidTokenException;
use Lexik\Bundle\JWTAuthenticationBundle\Exception\JWTDecodeFailureException;
use Lexik\Bundle\JWTAuthenticationBundle\Exception\MissingTokenException;
use Lexik\Bundle\JWTAuthenticationBundle\Response\JWTAuthenticationFailureResponse;
use Lexik\Bundle\JWTAuthenticationBundle\Security\Authenticator\Token\JWTPostAuthenticationToken;
use Lexik\Bundle\JWTAuthenticationBundle\Security\User\PayloadAwareUserProviderInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\TokenExtractor\AuthorizationHeaderTokenExtractor;
use Lexik\Bundle\JWTAuthenticationBundle\TokenExtractor\CookieTokenExtractor;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\UserNotFoundException;
use Symfony\Component\Security\Core\User\ChainUserProvider;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Security\Core\User\UserProviderInterface;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;
use Symfony\Contracts\EventDispatcher\EventDispatcherInterface;

class JwtCookieOrHeaderAuthenticator extends AbstractAuthenticator
{
    private const AUTH_COOKIE = JwtCookieAuthenticationSuccessHandler::AUTH_COOKIE;

    public function __construct(
        private JWTTokenManagerInterface $jwtManager,
        private EventDispatcherInterface $eventDispatcher,
        private UserProviderInterface $userProvider,
    ) {
    }

    public function start(Request $request, ?AuthenticationException $authException = null): Response
    {
        $exception = new MissingTokenException('JWT Token not found', 0, $authException);
        $event = new JWTNotFoundEvent($exception, new JWTAuthenticationFailureResponse($exception->getMessageKey()), $request);

        $this->eventDispatcher->dispatch($event, Events::JWT_NOT_FOUND);

        return $event->getResponse();
    }

    public function supports(Request $request): ?bool
    {
        // Check if the request is part of the API and a token exists either in the header or cookie
        return $request->headers->has('Authorization') || $request->cookies->has(self::AUTH_COOKIE);
    }

    public function authenticate(Request $request): Passport
    {
        // Try to extract the token from the Authorization header
        $header_extractor = new AuthorizationHeaderTokenExtractor('Bearer', 'Authorization');
        $token = $header_extractor->extract($request);

        // If no token in the header, fall back to the HTTP-only cookie
        if (!$token && $request->cookies->has(self::AUTH_COOKIE))
        {
            $cookie_extractor = new CookieTokenExtractor(self::AUTH_COOKIE);
            $token = $cookie_extractor->extract($request);
        }

        if ($token === false)
        {
            throw new \LogicException('Unable to extract a JWT token from the request. Also, make sure to call `supports()` before `authenticate()` to get a proper client error.');
        }

        try
        {
            if (!$payload = $this->jwtManager->parse($token))
            {
                throw new InvalidTokenException('Invalid JWT Token');
            }
        }
        catch (JWTDecodeFailureException $e)
        {
            if (JWTDecodeFailureException::EXPIRED_TOKEN === $e->getReason())
            {
                throw new ExpiredTokenException();
            }

            throw new InvalidTokenException('Invalid JWT Token', 0, $e);
        }

        $idClaim = $this->jwtManager->getUserIdClaim();
        if (!isset($payload[$idClaim]))
        {
            throw new InvalidPayloadException($idClaim);
        }

        $passport = new SelfValidatingPassport(
            new UserBadge(
                (string)$payload[$idClaim],
                fn ($userIdentifier) => $this->loadUser($payload, $userIdentifier)
            )
        );

        $passport->setAttribute('payload', $payload);
        $passport->setAttribute('token', $token);

        return $passport;
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        return null;
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): ?Response
    {
        $errorMessage = strtr($exception->getMessageKey(), $exception->getMessageData());
        $response = new JWTAuthenticationFailureResponse($errorMessage);

        if ($exception instanceof ExpiredTokenException)
        {
            $event = new JWTExpiredEvent($exception, $response, $request);
            $eventName = Events::JWT_EXPIRED;
        }
        else
        {
            $event = new JWTInvalidEvent($exception, $response, $request);
            $eventName = Events::JWT_INVALID;
        }

        $this->eventDispatcher->dispatch($event, $eventName);

        return $event->getResponse();
    }

    /**
     * Loads the user to authenticate.
     *
     * @param array  $payload  The token payload
     * @param string $identity The key from which to retrieve the user "identifier"
     */
    protected function loadUser(array $payload, string $identity): UserInterface
    {
        if ($this->userProvider instanceof PayloadAwareUserProviderInterface)
        {
            return $this->userProvider->loadUserByIdentifierAndPayload($identity, $payload);
        }

        if ($this->userProvider instanceof ChainUserProvider)
        {
            foreach ($this->userProvider->getProviders() as $provider)
            {
                try
                {
                    if ($provider instanceof PayloadAwareUserProviderInterface)
                    {
                        return $provider->loadUserByIdentifierAndPayload($identity, $payload);
                    }

                    return $provider->loadUserByIdentifier($identity);
                }
                catch (AuthenticationException $e)
                {
                    // try next one
                }
            }

            $ex = new UserNotFoundException(sprintf('There is no user with identifier "%s".', $identity));
            $ex->setUserIdentifier($identity);

            throw $ex;
        }

        return $this->userProvider->loadUserByIdentifier($identity);
    }

    public function createToken(Passport $passport, string $firewallName): TokenInterface
    {
        $token = new JWTPostAuthenticationToken($passport->getUser(), $firewallName, $passport->getUser()->getRoles(), $passport->getAttribute('token'));

        $this->eventDispatcher->dispatch(new JWTAuthenticatedEvent($passport->getAttribute('payload'), $token), Events::JWT_AUTHENTICATED);

        return $token;
    }
}
