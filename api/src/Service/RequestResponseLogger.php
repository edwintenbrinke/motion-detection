<?php

namespace App\Service;

use Psr\Log\LoggerInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;

class RequestResponseLogger
{
    private LoggerInterface $logger;

    public function __construct(LoggerInterface $request_response_logger)
    {
        $this->logger = $request_response_logger;
    }

    public function onKernelRequest(RequestEvent $event): void
    {
        $request = $event->getRequest();

        // Log request details
        $this->logger->info('Incoming Request', [
            'method'  => $request->getMethod(),
            'uri'     => $request->getUri(),
            'headers' => $request->headers->all(),
            'cookies' => $request->cookies->all(),
            'query'   => $request->query->all(),
            'request' => $request->request->all()
        ]);
    }

    public function onKernelResponse(ResponseEvent $event): void
    {
        $response = $event->getResponse();
        $request = $event->getRequest(); // Retrieve the associated request

        // Log response details, including the request URL
        $this->logger->info('Outgoing Response', [
            'status_code' => $response->getStatusCode(),
            'headers'     => $response->headers->all(),
            'content'     => $response->getContent(),
            'request_uri' => $request->getUri(), // Log the original request URL
        ]);
    }
}
