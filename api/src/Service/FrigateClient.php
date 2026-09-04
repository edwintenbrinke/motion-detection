<?php

namespace App\Service;

use Symfony\Component\Yaml\Yaml;
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
     *
     * The clip is the interesting one. `/api/events/<id>/clip.mp4` returns *exactly* the
     * event window -- a 3-second event gives a 3.037-second clip -- so you never see the
     * approach, which is usually the part worth seeing. `record.*.pre_capture` does not
     * change this; it decides which recording segments are retained, and those segments
     * are already on disk. So when the event's times are known, ask for the padded range
     * instead. Measured: the same event with 5 s either side returns 13.03 s.
     *
     * @param array{camera?: string, start?: int, end?: int}|null $range
     */
    public function eventMediaPath(string $kind, string $event_id, ?array $range = null): ?string
    {
        $id = rawurlencode($event_id);

        if ($kind === 'clip' && $range !== null && isset($range['camera'], $range['start'], $range['end']))
        {
            return sprintf(
                '/api/%s/start/%d/end/%d/clip.mp4',
                rawurlencode((string) $range['camera']),
                $range['start'],
                $range['end'],
            );
        }

        return match ($kind) {
            'thumbnail' => "/api/events/{$id}/thumbnail.jpg",
            'snapshot' => "/api/events/{$id}/snapshot.jpg",
            'clip' => "/api/events/{$id}/clip.mp4",
            default => null,
        };
    }

    /**
     * Deletes an event upstream, with its clip and snapshot. There is no undo: Frigate
     * removes the media immediately.
     */
    public function deleteEvent(string $event_id): bool
    {
        $response = $this->http_client->request(
            'DELETE',
            $this->baseUrl() . '/api/events/' . rawurlencode($event_id),
            ['timeout' => 10],
        );

        $status = $response->getStatusCode();

        // 404 means it is already gone, which is the state the caller wanted.
        return $status < 300 || $status === 404;
    }

    /**
     * Event ids Frigate currently knows about in a time range. Used to reconcile
     * deletions: the sync only ever inserted and updated, so anything removed upstream
     * lived on in the feed forever, pointing at media that 404s.
     *
     * @return list<string>
     */
    public function eventIdsBetween(int $after, int $before): array
    {
        $response = $this->http_client->request('GET', $this->baseUrl() . '/api/events', [
            'query' => ['after' => $after, 'before' => $before, 'limit' => 500, 'include_thumbnails' => 0],
            'timeout' => 15,
        ]);

        return array_values(array_filter(array_map(
            static fn (array $event): string => (string) ($event['id'] ?? ''),
            $response->toArray(),
        )));
    }

    /**
     * Writes individual config keys, the way Frigate's own UI does.
     *
     * Deliberately not the whole-file `POST /api/config/save`: that would mean parsing the
     * YAML here and writing it back, and a round-trip through any YAML library destroys
     * every comment in the file. That config is heavily commented on purpose (ADR 0005
     * makes the PVC the source of truth, so those comments are where the reasoning lives).
     * `config/set` edits in place and leaves the rest of the file alone.
     *
     * @param array<string, string> $values dotted config path => value
     *
     * @throws \RuntimeException when Frigate rejects the change
     */
    public function setConfig(array $values): void
    {
        if ($values === [])
        {
            return;
        }

        // Every query parameter is treated as a config path to set -- including, if you
        // send it, `requires_restart`, which Frigate then tries to validate as a top-level
        // config key and rejects the whole request with "Error parsing config". The real
        // error only appears in Frigate's own log, several frames down a pydantic trace.
        $query = [];
        foreach ($values as $key => $value)
        {
            $query[] = rawurlencode($key) . '=' . rawurlencode($value);
        }

        $response = $this->http_client->request(
            'PUT',
            $this->baseUrl() . '/api/config/set?' . implode('&', $query),
            // The endpoint requires a body even when every value is in the query string;
            // without one it answers 422 "Field required" and says nothing about which.
            ['json' => new \stdClass(), 'timeout' => 20],
        );

        if ($response->getStatusCode() >= 300)
        {
            throw new \RuntimeException('Frigate weigerde de configuratie: ' . $response->getContent(false));
        }
    }

    /**
     * Replaces the whole config file.
     *
     * Needed because `config/set` can only *set* keys, never remove one: writing an empty
     * value for a deleted zone leaves the zone behind with a required field missing, and
     * Frigate rejects the entire request. Deleting anything therefore means writing the
     * file.
     *
     * The cost is real and worth naming: this round-trips YAML, so **every comment in the
     * live config is lost**. That file is heavily annotated, and this is the thing that
     * strips it. It is acceptable only because ADR 0005 already says the PVC is the source
     * of truth and git holds the annotated seed -- the reasoning survives in the repo, not
     * on the volume. Frigate's own config editor does exactly the same thing on save.
     *
     * @param array<string, mixed> $config
     */
    public function saveConfig(array $config, string $save_option = 'restart'): void
    {
        $yaml = Yaml::dump($config, 8, 2, Yaml::DUMP_MULTI_LINE_LITERAL_BLOCK);

        // `save_option` is required and decides what happens after the write: `saveonly`
        // leaves the running config alone, `restart` applies it. Without the parameter the
        // endpoint answers 422 and names only the missing field, not what it accepts.
        //
        // `restart` here means the restart is Frigate's own -- there is no separate call to
        // make and no window where the file and the process disagree.
        $response = $this->http_client->request('POST', $this->baseUrl() . '/api/config/save', [
            'query' => ['save_option' => $save_option],
            'headers' => ['Content-Type' => 'text/plain'],
            'body' => $yaml,
            'timeout' => 30,
        ]);

        if ($response->getStatusCode() >= 300)
        {
            throw new \RuntimeException('Frigate weigerde de configuratie: ' . $response->getContent(false));
        }
    }

    /**
     * The saved config file, parsed. Not `config()`, which returns the *running* config
     * with every default filled in -- writing that back would bake several hundred
     * defaults into the file and make the next upgrade's changes invisible.
     *
     * @return array<string, mixed>
     */
    public function rawConfig(): array
    {
        $response = $this->http_client->request('GET', $this->baseUrl() . '/api/config/raw', ['timeout' => 15]);
        $body = $response->getContent();

        // The endpoint returns the YAML as a JSON string, not as text/yaml.
        $decoded = json_decode($body, true);

        return Yaml::parse(is_string($decoded) ? $decoded : $body) ?? [];
    }

    /**
     * Restarts Frigate so a saved config becomes the running one.
     *
     * Necessary rather than optional: `config/set` writes the file and answers "restart to
     * apply", and until that happens `/api/config` keeps returning the old config -- so a
     * zone appears saved, reads back as absent, and matches nothing.
     *
     * It costs about eighty seconds of no camera, so it belongs behind an explicit action
     * and not behind an autosave.
     */
    public function restart(): void
    {
        try
        {
            $this->http_client->request('POST', $this->baseUrl() . '/api/restart', ['timeout' => 10])
                ->getStatusCode();
        }
        catch (\Throwable)
        {
            // Frigate drops the connection as it goes down, which is the request succeeding.
        }
    }

    /**
     * Zones and motion masks for one camera, in the app's shape.
     *
     * Frigate stores polygon points as a flat comma-separated string of **normalised**
     * coordinates in 0..1, in the order given -- it walks the polygon in that order, so
     * reordering silently redraws the zone. The app works in fractions of the frame too,
     * so the conversion is only about the string format, and it lives here rather than in
     * a Vue component so the app never has to know Frigate's spelling.
     *
     * @return array{zones: list<array<string, mixed>>, masks: list<list<array{x: float, y: float}>>}
     */
    public function cameraShapes(string $camera): array
    {
        $config = $this->config();
        $cam = $config['cameras'][$camera] ?? null;

        if ($cam === null)
        {
            throw new \RuntimeException(sprintf('Onbekende camera "%s"', $camera));
        }

        $zones = [];
        foreach (($cam['zones'] ?? []) as $name => $zone)
        {
            $zones[] = [
                'name' => (string) $name,
                'points' => self::decodePolygon($zone['coordinates'] ?? ''),
                'objects' => array_values($zone['objects'] ?? []),
                'inertia' => $zone['inertia'] ?? null,
                'loitering_time' => $zone['loitering_time'] ?? null,
            ];
        }

        $mask = $cam['motion']['mask'] ?? [];
        $masks = array_values(array_filter(array_map(
            static fn (string $polygon): array => self::decodePolygon($polygon),
            is_array($mask) ? $mask : array_filter([$mask]),
        )));

        return ['zones' => $zones, 'masks' => $masks];
    }

    /**
     * @param list<array{x: float, y: float}> $points
     */
    public static function encodePolygon(array $points): string
    {
        $parts = [];
        foreach ($points as $point)
        {
            // Three decimals is roughly two pixels on a 1080p frame -- below what anyone
            // can place with a finger, and it keeps the config readable.
            $parts[] = round((float) $point['x'], 3);
            $parts[] = round((float) $point['y'], 3);
        }

        return implode(',', $parts);
    }

    /**
     * @return list<array{x: float, y: float}>
     */
    public static function decodePolygon(string $coordinates): array
    {
        $numbers = array_values(array_filter(
            array_map('trim', explode(',', $coordinates)),
            static fn (string $part): bool => $part !== '' && is_numeric($part),
        ));

        $points = [];
        for ($i = 0; $i + 1 < count($numbers); $i += 2)
        {
            $points[] = ['x' => (float) $numbers[$i], 'y' => (float) $numbers[$i + 1]];
        }

        return $points;
    }

    /**
     * Which parts of a range actually have recordings, hour by hour.
     *
     * @return list<array<string, mixed>>
     */
    public function recordings(string $camera, int $after, int $before): array
    {
        $response = $this->http_client->request(
            'GET',
            sprintf('%s/api/%s/recordings', $this->baseUrl(), rawurlencode($camera)),
            ['query' => ['after' => $after, 'before' => $before], 'timeout' => 20],
        );

        return $response->toArray();
    }

    /**
     * Frigate's preview files: a low-fps timelapse per hour, a few hundred kilobytes each.
     * This is what makes a scrubber cheap -- dragging over an hour of 1080p would otherwise
     * mean streaming an hour of 1080p.
     *
     * @return list<array{camera: string, src: string, type: string, start: float, end: float}>
     */
    public function previews(string $camera, int $after, int $before): array
    {
        $response = $this->http_client->request(
            'GET',
            sprintf('%s/api/preview/%s/start/%d/end/%d', $this->baseUrl(), rawurlencode($camera), $after, $before),
            ['timeout' => 20],
        );

        return $response->toArray();
    }

    /**
     * Upstream path for a wall-clock range, for the timeline's own media.
     *
     * `vod` is the HLS playlist for scrubbing a recording; `preview` is a file Frigate has
     * already written and hands us a path to.
     */
    public function timelineMediaPath(string $kind, string $camera, int $start, int $end, ?string $src = null): ?string
    {
        return match ($kind) {
            'vod' => sprintf('/vod/%s/start/%d/end/%d/index.m3u8', rawurlencode($camera), $start, $end),
            'clip' => sprintf('/api/%s/start/%d/end/%d/clip.mp4', rawurlencode($camera), $start, $end),
            // Frigate returns the preview's own path; passing it through unchanged keeps us
            // out of the business of guessing its filename convention.
            'preview' => $src !== null && str_starts_with($src, '/') ? $src : null,
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
