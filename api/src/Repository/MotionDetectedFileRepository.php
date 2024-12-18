<?php

namespace App\Repository;

use App\DTO\PaginatedResponseDTO;
use App\Entity\MotionDetectedFile;
use App\Service\PaginationService;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\HttpFoundation\Request;

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

    public function returnPaginatedCalendar(\DateTime $start_time, \DateTime $end_time): array
    {
        $query_builder = $this->createQueryBuilder('m')
            ->select('m')
            ->where('m.created_at >= :start_time AND m.created_at <= :end_time')
            ->setParameter('start_time', $start_time)
            ->setParameter('end_time', $end_time);
        return $query_builder->getQuery()->getResult();
    }
}
