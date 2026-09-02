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
            $decoded = base64_decode($cursor, true);
            if ($decoded !== false && str_contains($decoded, '|'))
            {
                [$started_at, $id] = explode('|', $decoded, 2);
                $qb->andWhere('(e.started_at < :cursor_started_at) OR (e.started_at = :cursor_started_at AND e.id < :cursor_id)')
                    ->setParameter('cursor_started_at', new \DateTimeImmutable($started_at))
                    ->setParameter('cursor_id', $id);
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
            // e.zones is a JSON column; a simple IN() can't reach into it portably, so
            // this filters in PHP below rather than in SQL. Fine at this table's size --
            // revisit with a native JSON_CONTAINS/JSON_OVERLAPS if it ever isn't.
        }
        if ($severity !== null)
        {
            $qb->andWhere('e.severity = :severity')->setParameter('severity', $severity);
        }

        /** @var list<Event> $results */
        $results = $qb->getQuery()->getResult();

        if ($zones !== [])
        {
            $results = array_values(array_filter(
                $results,
                static fn (Event $event) => array_intersect($event->getZones(), $zones) !== []
            ));
        }

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
