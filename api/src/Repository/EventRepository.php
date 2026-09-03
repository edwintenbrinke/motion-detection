<?php

namespace App\Repository;

use App\Entity\Event;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Event>
 */
class EventRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Event::class);
    }

    /**
     * Cursor-paginated feed, newest first. The cursor is base64("<started_at>|<id>") --
     * see EventController and docs/v2/07-api-and-data-model.md#endpoints. Cursor-based
     * rather than offset-based because new events keep arriving while the app scrolls;
     * an offset would shift under the user mid-scroll.
     *
     * @param list<string> $cameras
     * @param list<string> $labels
     * @param list<string> $zones
     * @return list<Event>
     */
    public function findFeed(
        int $limit,
        ?string $cursor = null,
        array $cameras = [],
        array $labels = [],
        array $zones = [],
        ?string $severity = null,
    ): array {
        $qb = $this->createQueryBuilder('e')
            ->orderBy('e.started_at', 'DESC')
            ->addOrderBy('e.id', 'DESC')
            ->setMaxResults($limit);

        if ($cursor !== null)
        {
            // A cursor is client-supplied and may be stale, truncated or tampered with.
            // Anything unparseable is ignored and the feed simply starts from the top --
            // the same thing the base64/separator checks below already do. It must not
            // become a 500: an unparseable date used to throw straight out of here.
            $decoded = base64_decode($cursor, true);
            if ($decoded !== false && str_contains($decoded, '|'))
            {
                [$started_at, $id] = explode('|', $decoded, 2);

                try
                {
                    $cursor_started_at = new \DateTimeImmutable($started_at);
                }
                catch (\Exception)
                {
                    $cursor_started_at = null;
                }

                if ($cursor_started_at !== null)
                {
                    $qb->andWhere('(e.started_at < :cursor_started_at) OR (e.started_at = :cursor_started_at AND e.id < :cursor_id)')
                        ->setParameter('cursor_started_at', $cursor_started_at)
                        ->setParameter('cursor_id', $id);
                }
            }
        }

        if ($cameras !== [])
        {
            $qb->andWhere('e.camera IN (:cameras)')->setParameter('cameras', $cameras);
        }
        if ($labels !== [])
        {
            $qb->andWhere('e.label IN (:labels)')->setParameter('labels', $labels);
        }
        if ($zones !== [])
        {
            // Must happen in SQL, not in PHP after the query: filtering a LIMITed result
            // set afterwards makes the caller's "did I get a full page?" check wrong and
            // silently ends the feed while matching rows still exist further back.
            // JSON_CONTAINS is registered in config/packages/doctrine.yaml. An event
            // matches if it is in ANY of the requested zones, so these are OR'd.
            $zone_conditions = [];
            foreach (array_values($zones) as $index => $zone)
            {
                $zone_conditions[] = sprintf('JSON_CONTAINS(e.zones, :zone_%d) = 1', $index);
                // The candidate must itself be valid JSON -- the string "pad" encodes to
                // the 5 characters "pad" including the quotes.
                $qb->setParameter(sprintf('zone_%d', $index), json_encode($zone, JSON_THROW_ON_ERROR));
            }
            $qb->andWhere('(' . implode(' OR ', $zone_conditions) . ')');
        }
        if ($severity !== null)
        {
            $qb->andWhere('e.severity = :severity')->setParameter('severity', $severity);
        }

        /** @var list<Event> $results */
        $results = $qb->getQuery()->getResult();

        return $results;
    }

    public function countUnseen(): int
    {
        return (int) $this->createQueryBuilder('e')
            ->select('COUNT(e.id)')
            ->andWhere('e.seen = false')
            ->getQuery()
            ->getSingleScalarResult();
    }
}
