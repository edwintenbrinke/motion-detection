<?php

namespace App\Repository;

use App\Entity\NotificationRule;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<NotificationRule>
 */
class NotificationRuleRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, NotificationRule::class);
    }

    /**
     * @return list<NotificationRule>
     */
    public function findForUserInPriorityOrder(User $user): array
    {
        /** @var list<NotificationRule> */
        return $this->createQueryBuilder('r')
            ->andWhere('r.user = :user')
            ->andWhere('r.enabled = true')
            ->setParameter('user', $user)
            ->orderBy('r.priority', 'ASC')
            ->getQuery()
            ->getResult();
    }
}
