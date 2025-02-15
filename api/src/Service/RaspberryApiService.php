<?php

namespace App\Service;

use Symfony\Contracts\HttpClient\HttpClientInterface;

class RaspberryApiService
{
    private HttpClientInterface $http_client;

    public function __construct(HttpClientInterface $http_client, string $raspberry_base_url)
    {
        $this->http_client = $http_client->withOptions([
            'base_uri' => $raspberry_base_url,
        ]);
    }

    public function fetchLatestFrame(): ?string
    {
        $response = $this->http_client->request('GET', '/single_frame');

        if ($response->getStatusCode() !== 200)
        {
            return null;
        }

        return $response->getContent();
    }
}
