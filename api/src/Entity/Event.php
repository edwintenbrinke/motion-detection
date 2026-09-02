<?php

namespace App\Entity;

use App\Enum\EventSeverityEnum;
use App\Repository\EventRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * A mirror of one Frigate review item. Frigate holds the truth in its own SQLite database;
 * this table exists so the app can filter, paginate and search without pointing a mobile
 * client at that SQLite file directly. See docs/v2/07-api-and-data-model.md#event-mirror.
 *
 * The primary key is Frigate's own review-item id (not autoincrement) so that repeated
 * deliveries of the same event -- it arrives at least at "new" and "end", and again
 * whenever enrichment lands -- upsert cleanly instead of creating duplicates. See
 * InternalEventController, which is the only writer of this entity.
 */
#[ORM\Entity(repositoryClass: EventRepository::class)]
#[ORM\Index(columns: ['camera', 'started_at'], name: 'idx_event_camera_started_at')]
#[ORM\Index(columns: ['severity', 'started_at'], name: 'idx_event_severity_started_at')]
class Event
{
    #[ORM\Id]
    #[ORM\Column(length: 64)]
    private string $id;

    #[ORM\Column(length: 64)]
    private string $camera;

    #[ORM\Column(enumType: EventSeverityEnum::class)]
    private EventSeverityEnum $severity;

    #[ORM\Column(length: 64)]
    private string $label;

    #[ORM\Column(length: 64, nullable: true)]
    private ?string $sub_label = null;

    /** @var list<string> */
    #[ORM\Column]
    private array $zones = [];

    /**
     * Output of the layer-2 rules engine (zone + time logic). Empty until that's built --
     * see docs/v2/03-detection-and-ai.md#layer-2--zone--time-logic-free-deterministic.
     *
     * @var list<string>
     */
    #[ORM\Column]
    private array $derived_tags = [];

    #[ORM\Column(nullable: true)]
    private ?float $top_score = null;

    #[ORM\Column]
    private \DateTimeImmutable $started_at;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $ended_at = null;

    #[ORM\Column]
    private bool $has_clip = false;

    #[ORM\Column]
    private bool $has_snapshot = false;

    // GenAI enrichment (layer 4) -- arrives asynchronously, minutes after the row is
    // first created. Null until it does. See docs/v2/03-detection-and-ai.md#layer-4.
    #[ORM\Column(nullable: true)]
    private ?string $title = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(length: 32, nullable: true)]
    private ?string $genai_severity = null;

    // Single-user system today -- see docs/v2/07-api-and-data-model.md, "per-user read
    // state" is a real TODO once there's more than one account.
    #[ORM\Column]
    private bool $seen = false;

    /**
     * Set by POST /api/events/{id}/feedback ("dit klopt niet"). Free text for now; the
     * intent is to feed this into the layer-3 classifier's training set later -- see
     * docs/v2/03-detection-and-ai.md#layer-3.
     */
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $feedback = null;

    #[ORM\Column]
    private \DateTimeImmutable $created_at;

    #[ORM\Column]
    private \DateTimeImmutable $updated_at;

    public function __construct(string $id, string $camera, EventSeverityEnum $severity, string $label, \DateTimeImmutable $started_at)
    {
        $this->id = $id;
        $this->camera = $camera;
        $this->severity = $severity;
        $this->label = $label;
        $this->started_at = $started_at;
        $this->created_at = new \DateTimeImmutable();
        $this->updated_at = new \DateTimeImmutable();
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getCamera(): string
    {
        return $this->camera;
    }

    public function setCamera(string $camera): void
    {
        $this->camera = $camera;
    }

    public function getSeverity(): EventSeverityEnum
    {
        return $this->severity;
    }

    public function setSeverity(EventSeverityEnum $severity): void
    {
        $this->severity = $severity;
    }

    public function getLabel(): string
    {
        return $this->label;
    }

    public function setLabel(string $label): void
    {
        $this->label = $label;
    }

    public function getSubLabel(): ?string
    {
        return $this->sub_label;
    }

    public function setSubLabel(?string $sub_label): void
    {
        $this->sub_label = $sub_label;
    }

    /**
     * @return list<string>
     */
    public function getZones(): array
    {
        return $this->zones;
    }

    /**
     * @param list<string> $zones
     */
    public function setZones(array $zones): void
    {
        $this->zones = $zones;
    }

    /**
     * @return list<string>
     */
    public function getDerivedTags(): array
    {
        return $this->derived_tags;
    }

    /**
     * @param list<string> $derived_tags
     */
    public function setDerivedTags(array $derived_tags): void
    {
        $this->derived_tags = $derived_tags;
    }

    public function getTopScore(): ?float
    {
        return $this->top_score;
    }

    public function setTopScore(?float $top_score): void
    {
        $this->top_score = $top_score;
    }

    public function getStartedAt(): \DateTimeImmutable
    {
        return $this->started_at;
    }

    public function setStartedAt(\DateTimeImmutable $started_at): void
    {
        $this->started_at = $started_at;
    }

    public function getEndedAt(): ?\DateTimeImmutable
    {
        return $this->ended_at;
    }

    public function setEndedAt(?\DateTimeImmutable $ended_at): void
    {
        $this->ended_at = $ended_at;
    }

    public function hasClip(): bool
    {
        return $this->has_clip;
    }

    public function setHasClip(bool $has_clip): void
    {
        $this->has_clip = $has_clip;
    }

    public function hasSnapshot(): bool
    {
        return $this->has_snapshot;
    }

    public function setHasSnapshot(bool $has_snapshot): void
    {
        $this->has_snapshot = $has_snapshot;
    }

    public function getTitle(): ?string
    {
        return $this->title;
    }

    public function setTitle(?string $title): void
    {
        $this->title = $title;
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(?string $description): void
    {
        $this->description = $description;
    }

    public function getGenaiSeverity(): ?string
    {
        return $this->genai_severity;
    }

    public function setGenaiSeverity(?string $genai_severity): void
    {
        $this->genai_severity = $genai_severity;
    }

    public function isSeen(): bool
    {
        return $this->seen;
    }

    public function setSeen(bool $seen): void
    {
        $this->seen = $seen;
    }

    public function getFeedback(): ?string
    {
        return $this->feedback;
    }

    public function setFeedback(?string $feedback): void
    {
        $this->feedback = $feedback;
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
