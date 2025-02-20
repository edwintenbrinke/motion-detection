<?php

namespace App\Repository;

use App\DTO\PaginatedResponseDTO;
use App\Entity\MotionDetectedFile;
use App\Enum\MotionDetectedFileTypeEnum;
use App\Service\PaginationService;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Common\Collections\Order;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<MotionDetectedFile>
 */
class MotionDetectedFileRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, MotionDetectedFile::class);
    }

    public function returnPaginatedTable(int $page, int $limit): PaginatedResponseDTO
    {
        $query_builder = $this->createQueryBuilder('m')
            ->select('m');
        return PaginationService::paginateQueryBuilder($query_builder, $page, $limit);
    }

    public function returnPaginatedCalendar(\DateTime $date, ?\DateTime $since = null): array
    {
        $start_time = $date->format('Y-m-d 00:00:00');
        $end_time = $date->format('Y-m-d 23:59:59');

        $qb = $this->createQueryBuilder('m')
            ->where('m.created_at BETWEEN :start_time AND :end_time')
            ->andWhere('m.processed = :processed')
            ->setParameter('processed', true)
            ->setParameter('start_time', $start_time)
            ->setParameter('end_time', $end_time);

        if ($since) {
            $qb->andWhere('m.created_at > :since')
                ->setParameter('since', $since->format('Y-m-d H:i:s'));
        }
dd($since);
        return $qb->orderBy('m.created_at', Order::Descending->value)
            ->getQuery()
            ->getResult();
    }


    public function getTotalFileSize(MotionDetectedFileTypeEnum $type): int
    {
        return (int)$this->createQueryBuilder('f')
            ->select('SUM(f.file_size)')
            ->where('f.type = :type')
            ->setParameter('type', $type)
            ->getQuery()
            ->getSingleScalarResult();
    }

    public function findFilesOrderedByDateWithLimit(MotionDetectedFileTypeEnum $type, int $limit, int $offset): array
    {
        return $this->createQueryBuilder('f')
            ->where('f.type = :type')
            ->setParameter('type', $type)
            ->orderBy('f.created_at', 'ASC')
            ->getQuery()
            ->getResult();
    }
}
