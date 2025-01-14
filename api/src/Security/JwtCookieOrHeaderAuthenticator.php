<?php

namespace App\Security;

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
use Lexik\Bundle\JWTAuthenticationBundle\Security\Authenticator\JWTAuthenticator;
use Lexik\Bundle\JWTAuthenticationBundle\TokenExtractor\AuthorizationHeaderTokenExtractor;
use Lexik\Bundle\JWTAuthenticationBundle\TokenExtractor\CookieTokenExtractor;
use Lexik\Bundle\JWTAuthenticationBundle\TokenExtractor\TokenExtractorInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Component\Security\Core\User\UserProviderInterface;
use Symfony\Contracts\EventDispatcher\EventDispatcherInterface;
use Symfony\Contracts\Translation\TranslatorInterface;

class JwtCookieOrHeaderAuthenticator extends JWTAuthenticator
{
    private const AUTH_COOKIE = JwtCookieAuthenticationSuccessHandler::AUTH_COOKIE;

    private JWTTokenManagerInterface $jwtManager;

    public function __construct(
        JWTTokenManagerInterface $jwtManager,
        EventDispatcherInterface $eventDispatcher,
        TokenExtractorInterface $tokenExtractor,
        UserProviderInterface $userProvider,
        ?TranslatorInterface $translator = null
    ) {
        parent::__construct($jwtManager, $eventDispatcher, $tokenExtractor, $userProvider, $translator);
        $this->jwtManager = $jwtManager;
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
        if (!$token && $request->cookies->has(self::AUTH_COOKIE)) {
            $cookie_extractor = new CookieTokenExtractor(self::AUTH_COOKIE);
            $token = $cookie_extractor->extract($request);
        }

        if ($token === false) {
            throw new \LogicException('Unable to extract a JWT token from the request. Also, make sure to call `supports()` before `authenticate()` to get a proper client error.');
        }

        try {
            if (!$payload = $this->jwtManager->parse($token)) {
                throw new InvalidTokenException('Invalid JWT Token');
            }
        } catch (JWTDecodeFailureException $e) {
            if (JWTDecodeFailureException::EXPIRED_TOKEN === $e->getReason()) {
                throw new ExpiredTokenException();
            }

            throw new InvalidTokenException('Invalid JWT Token', 0, $e);
        }

        $idClaim = $this->jwtManager->getUserIdClaim();
        if (!isset($payload[$idClaim])) {
            throw new InvalidPayloadException($idClaim);
        }

        $passport = new SelfValidatingPassport(
            new UserBadge(
                (string) $payload[$idClaim],
                fn ($userIdentifier) => $this->loadUser($payload, $userIdentifier)
            )
        );

        $passport->setAttribute('payload', $payload);
        $passport->setAttribute('token', $token);

        return $passport;
    }
}
