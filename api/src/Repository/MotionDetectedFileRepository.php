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

    public function returnPaginated(int $page, int $limit): PaginatedResponseDTO
    {
        $query_builder = $this->createQueryBuilder('m')
            ->select('m');
        return PaginationService::paginateQueryBuilder($query_builder, $page, $limit);
    }
}
