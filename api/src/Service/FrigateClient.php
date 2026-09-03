<?php

namespace App\Service;

use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * The only thing in this application that talks to Frigate.
 *
 * Frigate is deliberately not reachable from outside the cluster -- no HTTPRoute, no
 * tunnel, only a LAN LoadBalancer and its in-cluster Service. Every byte the app shows
 * therefore arrives through here or through nginx's X-Accel-Redirect to the same host,
 * which is what "media is only accessible from the application" actually means in
 * practice. See docs/v2/06-kubernetes.md#networking.
 */
class FrigateClient
{
    public function __construct(
        private readonly HttpClientInterface $http_client,
        private readonly string $frigate_base_url,
    ) {
    }

    public function baseUrl(): string
    {
        return rtrim($this->frigate_base_url, '/');
    }

    /**
     * @return array<string, mixed>
     */
    public function config(): array
    {
        return $this->getJson('/api/config');
    }

    /**
     * @return array<string, mixed>
     */
    public function stats(): array
    {
        return $this->getJson('/api/stats');
    }

    /**
     * The cameras Frigate is actually running, with the detect resolution it settled on.
     * Read from Frigate rather than mirrored into our own database on purpose: a camera
     * that exists in two places is a camera that will disagree with itself.
     *
     * @return list<array{name: string, display_name: string, width: ?int, height: ?int, retention: ?array}>
     */
    public function cameras(): array
    {
        $config = $this->config();
        $cameras = [];

        foreach (($config['cameras'] ?? []) as $name => $camera)
        {
            if (($camera['enabled'] ?? true) === false)
            {
                continue;
            }

            $detect = $camera['detect'] ?? [];
            $record = $camera['record'] ?? $config['record'] ?? [];

            $cameras[] = [
                'name' => (string) $name,
                'display_name' => $this->displayName((string) $name),
                'width' => isset($detect['width']) ? (int) $detect['width'] : null,
                'height' => isset($detect['height']) ? (int) $detect['height'] : null,
                'retention' => [
                    'continuous_days' => $record['continuous']['days'] ?? null,
                    'alerts_days' => $record['alerts']['retain']['days'] ?? null,
                    'detections_days' => $record['detections']['retain']['days'] ?? null,
                ],
                'zones' => array_keys($camera['zones'] ?? []),
            ];
        }

        return $cameras;
    }

    /**
     * Path on Frigate for one kind of media belonging to one event. Returned as a path
     * rather than fetched: the bytes go out through nginx, not through PHP.
     */
    public function eventMediaPath(string $kind, string $event_id): ?string
    {
        $id = rawurlencode($event_id);

        return match ($kind) {
            'thumbnail' => "/api/events/{$id}/thumbnail.jpg",
            'snapshot' => "/api/events/{$id}/snapshot.jpg",
            'clip' => "/api/events/{$id}/clip.mp4",
            default => null,
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function getJson(string $path): array
    {
        $response = $this->http_client->request('GET', $this->baseUrl() . $path, [
            // Frigate is one hop away on the cluster network. If it has not answered in
            // five seconds it is not going to, and the app would rather render a stale
            // camera list than hold a request open.
            'timeout' => 5,
        ]);

        return $response->toArray();
    }

    private function displayName(string $name): string
    {
        return ucfirst(str_replace('_', ' ', $name));
    }
}
