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

    public function countItemsPerHour(\DateTime $since_datetime, \DateTime $end_of_day, MotionDetectedFileTypeEnum $type_enum): array
    {
        return $this->createQueryBuilder('i')
            ->select('HOUR(i.created_at) AS hour, COUNT(i.id) AS count')
            ->where('i.created_at BETWEEN :since_datetime AND :end_of_day')
            ->andWhere('i.processed = :processed')
            ->andWhere('i.type = :type')
            ->setParameter('since_datetime', $since_datetime)
            ->setParameter('end_of_day', $end_of_day)
            ->setParameter('processed', true)
            ->setParameter('type', $type_enum->value)
            ->groupBy('hour')
            ->orderBy('hour', 'ASC')
            ->getQuery()
            ->getResult();
    }

    public function returnPaginatedCalendar(\DateTime $start_time, \DateTime $end_time, MotionDetectedFileTypeEnum $type_enum): array
    {
        return $this->createQueryBuilder('m')
            ->where('m.created_at BETWEEN :start_time AND :end_time')
            ->andWhere('m.processed = :processed')
            ->andWhere('m.type = :type')
            ->setParameter('processed', true)
            ->setParameter('start_time', $start_time)
            ->setParameter('end_time', $end_time)
            ->setParameter('type', $type_enum->value)
            ->orderBy('m.created_at', Order::Descending->value)
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
