<?php

namespace App\Entity;

use App\Enum\NotificationActionEnum;
use App\Repository\NotificationRuleRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * One row of the notification rules engine. See docs/v2/04-notifications.md#the-rules-engine.
 *
 * Evaluated in `priority` order (lowest first); the first matching, enabled rule decides
 * the outcome for an incoming event. A null/empty matcher field means "any". This entity
 * is deliberately just data -- the matching logic lives in a service (not built yet; see
 * docs/v2/HANDOFF.md) so it can be unit-tested without a database.
 */
#[ORM\Entity(repositoryClass: NotificationRuleRepository::class)]
class NotificationRule
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private User $user;

    /** Lower evaluates first. */
    #[ORM\Column]
    private int $priority;

    /** Null matches any camera. */
    #[ORM\Column(length: 64, nullable: true)]
    private ?string $camera = null;

    /** Null matches any zone. */
    #[ORM\Column(length: 64, nullable: true)]
    private ?string $zone = null;

    /** Empty matches any label. @var list<string> */
    #[ORM\Column]
    private array $labels = [];

    /** Empty matches any sub-label. @var list<string> */
    #[ORM\Column]
    private array $sub_labels = [];

    /** "HH:MM", inclusive. Null with to_time null means "any time". */
    #[ORM\Column(length: 5, nullable: true)]
    private ?string $from_time = null;

    #[ORM\Column(length: 5, nullable: true)]
    private ?string $to_time = null;

    #[ORM\Column(enumType: NotificationActionEnum::class)]
    private NotificationActionEnum $action;

    #[ORM\Column]
    private int $cooldown_seconds = 60;

    #[ORM\Column]
    private bool $enabled = true;

    #[ORM\Column]
    private \DateTimeImmutable $created_at;

    #[ORM\Column]
    private \DateTimeImmutable $updated_at;

    public function __construct(User $user, int $priority, NotificationActionEnum $action)
    {
        $this->user = $user;
        $this->priority = $priority;
        $this->action = $action;
        $this->created_at = new \DateTimeImmutable();
        $this->updated_at = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getPriority(): int
    {
        return $this->priority;
    }

    public function setPriority(int $priority): void
    {
        $this->priority = $priority;
    }

    public function getCamera(): ?string
    {
        return $this->camera;
    }

    public function setCamera(?string $camera): void
    {
        $this->camera = $camera;
    }

    public function getZone(): ?string
    {
        return $this->zone;
    }

    public function setZone(?string $zone): void
    {
        $this->zone = $zone;
    }

    /**
     * @return list<string>
     */
    public function getLabels(): array
    {
        return $this->labels;
    }

    /**
     * @param list<string> $labels
     */
    public function setLabels(array $labels): void
    {
        $this->labels = $labels;
    }

    /**
     * @return list<string>
     */
    public function getSubLabels(): array
    {
        return $this->sub_labels;
    }

    /**
     * @param list<string> $sub_labels
     */
    public function setSubLabels(array $sub_labels): void
    {
        $this->sub_labels = $sub_labels;
    }

    public function getFromTime(): ?string
    {
        return $this->from_time;
    }

    public function setFromTime(?string $from_time): void
    {
        $this->from_time = $from_time;
    }

    public function getToTime(): ?string
    {
        return $this->to_time;
    }

    public function setToTime(?string $to_time): void
    {
        $this->to_time = $to_time;
    }

    public function getAction(): NotificationActionEnum
    {
        return $this->action;
    }

    public function setAction(NotificationActionEnum $action): void
    {
        $this->action = $action;
    }

    public function getCooldownSeconds(): int
    {
        return $this->cooldown_seconds;
    }

    public function setCooldownSeconds(int $cooldown_seconds): void
    {
        $this->cooldown_seconds = $cooldown_seconds;
    }

    public function isEnabled(): bool
    {
        return $this->enabled;
    }

    public function setEnabled(bool $enabled): void
    {
        $this->enabled = $enabled;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->created_at;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updated_at;
    }

    public function touch(): void
    {
        $this->updated_at = new \DateTimeImmutable();
    }
}
