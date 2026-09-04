<?php

namespace App\Command;

use App\Entity\Event;
use App\Enum\EventSeverityEnum;
use App\Repository\EventRepository;
use App\Service\FrigateClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Pulls recent events from Frigate and upserts them into our own table, so the app has a
 * feed without waiting for Phase 6's MQTT bridge.
 *
 * This is the *polling* half of the same job event-bridge will do over MQTT. It is here
 * because the difference between "the app works" and "the app shows an empty list" should
 * not be a whole message broker, and because a poll that runs every minute is a fine
 * answer for one camera. When the bridge lands it takes over the live path and this stays
 * useful as a reconciler -- MQTT drops messages when nobody is listening, and a system
 * that can only learn about events in real time can never be caught up.
 *
 * Upserts on Frigate's own event id, so running it twice is a no-op and a re-run after an
 * outage backfills rather than duplicates.
 */
#[AsCommand(name: 'app:frigate:sync-events', description: 'Mirror recent Frigate events into the app database')]
class SyncFrigateEventsCommand extends Command
{
    public function __construct(
        private readonly FrigateClient $frigate_client,
        private readonly HttpClientInterface $http_client,
        private readonly EntityManagerInterface $entity_manager,
        private readonly EventRepository $event_repository,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('limit', 'l', InputOption::VALUE_REQUIRED, 'How many recent events to fetch', '100')
            ->addOption('since', 's', InputOption::VALUE_REQUIRED, 'Only events after this unix timestamp')
            ->addOption('window-days', 'w', InputOption::VALUE_REQUIRED, 'How far back to mirror and reconcile', '7');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $limit = max(1, min(500, (int) $input->getOption('limit')));

        // An explicit window, not "the most recent N". Reconciling deletions needs a range
        // whose contents we can be sure of, and "the last 100 events" is not one: an event
        // deleted upstream simply falls off the end of that list and survives forever. A
        // window has edges, and everything inside it can be compared.
        $window_days = max(1, (int) $input->getOption('window-days'));
        $window_start = time() - ($window_days * 86400);

        if ($input->getOption('since') !== null)
        {
            $window_start = (int) $input->getOption('since');
        }

        $query = ['limit' => $limit, 'include_thumbnails' => 0, 'after' => $window_start];

        try
        {
            $response = $this->http_client->request(
                'GET',
                $this->frigate_client->baseUrl() . '/api/events',
                ['query' => $query, 'timeout' => 15],
            );
            $events = $response->toArray();
        }
        catch (\Throwable $e)
        {
            $io->error('Could not read events from Frigate: ' . $e->getMessage());

            return Command::FAILURE;
        }

        $created = 0;
        $updated = 0;

        foreach ($events as $payload)
        {
            $id = (string) ($payload['id'] ?? '');
            if ($id === '')
            {
                continue;
            }

            $camera = (string) ($payload['camera'] ?? 'unknown');
            $label = (string) ($payload['label'] ?? 'unknown');
            $started_at = $this->toDate($payload['start_time'] ?? null) ?? new \DateTimeImmutable();
            // Frigate's own alert/detection split, decided by the labels in its `review`
            // config -- not a threshold invented here.
            $severity = ($payload['severity'] ?? '') === 'alert'
                ? EventSeverityEnum::alert
                : EventSeverityEnum::detection;

            $event = $this->event_repository->find($id);
            $is_new = $event === null;

            if ($is_new)
            {
                $event = new Event($id, $camera, $severity, $label, $started_at);
            }

            $event->setCamera($camera);
            $event->setLabel($label);
            $event->setSubLabel($this->nullableString($payload['sub_label'] ?? null));
            $event->setSeverity($severity);
            $event->setZones(array_values(array_filter((array) ($payload['zones'] ?? []))));
            $event->setTopScore($this->nullableFloat($payload['data']['top_score'] ?? $payload['top_score'] ?? null));
            $event->setStartedAt($started_at);
            $event->setEndedAt($this->toDate($payload['end_time'] ?? null));
            $event->setHasClip((bool) ($payload['has_clip'] ?? false));
            $event->setHasSnapshot((bool) ($payload['has_snapshot'] ?? false));

            // Frigate's GenAI description, when Phase 7 turns it on. Never overwrite a
            // description we already have with an empty one -- enrichment arrives late.
            $description = $this->nullableString($payload['data']['description'] ?? null);
            if ($description !== null)
            {
                $event->setDescription($description);
            }

            if ($is_new)
            {
                $this->entity_manager->persist($event);
                ++$created;
            }
            else
            {
                ++$updated;
            }
        }

        $this->entity_manager->flush();

        $removed = $this->reconcileDeletions($events, $window_start, $limit, $io);

        $io->success(sprintf(
            'Frigate sync: %d new, %d updated, %d removed, %d seen.',
            $created,
            $updated,
            $removed,
            count($events),
        ));

        return Command::SUCCESS;
    }

    /**
     * Removes local events that Frigate no longer has, within a window we can be sure of.
     *
     * Without this the mirror only ever grows: the sync inserts and updates, so anything
     * deleted upstream -- by the app, by Frigate's own UI, or by retention -- stays in the
     * feed forever with media that answers 404.
     *
     * Two guards, and the first one was originally wrong in an instructive way. Bounding
     * the comparison to the span of the events that came back sounds safe, and means an
     * event deleted *before* the oldest survivor is never in range: it falls off the end of
     * the list and lives forever. The window has to be the one we asked for, not the one we
     * happened to get.
     *
     * The second guard is the limit. A window that returned exactly `limit` events was
     * truncated, so its older half is unaccounted for -- reconciling then would delete
     * events that exist. Skip, and let a later run with a smaller window catch up.
     *
     * @param list<array<string, mixed>> $events
     */
    private function reconcileDeletions(array $events, int $window_start, int $limit, SymfonyStyle $io): int
    {
        if (count($events) >= $limit)
        {
            $io->warning(sprintf(
                'Venster leverde %d events op de limiet van %d; opruimen overgeslagen om te voorkomen dat afgekapte events verdwijnen.',
                count($events),
                $limit,
            ));

            return 0;
        }

        $from = (new \DateTimeImmutable('@' . $window_start))->setTimezone(new \DateTimeZone('UTC'));
        $seen = array_column($events, 'id');

        $query = $this->event_repository->createQueryBuilder('e')
            ->where('e.started_at >= :from')
            ->setParameter('from', $from);

        // NOT IN () is a syntax error, and an empty upstream window is exactly the case
        // where every local event in it should go.
        if ($seen !== [])
        {
            $query->andWhere('e.id NOT IN (:seen)')->setParameter('seen', $seen);
        }

        $stale = $query->getQuery()->getResult();

        foreach ($stale as $event)
        {
            $io->writeln(sprintf('  weg bij Frigate, lokaal verwijderd: %s', $event->getId()));
            $this->entity_manager->remove($event);
        }

        if ($stale !== [])
        {
            $this->entity_manager->flush();
        }

        return count($stale);
    }

    private function nullableString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    private function nullableFloat(mixed $value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }

    private function toDate(mixed $timestamp): ?\DateTimeImmutable
    {
        if (!is_numeric($timestamp))
        {
            return null;
        }

        // Frigate timestamps are float unix seconds; the fractional part is not worth
        // keeping and DateTimeImmutable will not take it in an '@' constructor.
        return (new \DateTimeImmutable('@' . (int) $timestamp))->setTimezone(new \DateTimeZone('UTC'));
    }
}
