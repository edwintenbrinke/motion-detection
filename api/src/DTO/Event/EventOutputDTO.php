<?php

namespace App\DTO\Event;

class EventOutputDTO
{
    public string $id;
    public string $camera;
    public string $severity;
    public string $label;
    public ?string $sub_label;
    /** @var list<string> */
    public array $zones;
    /** @var list<string> */
    public array $derived_tags;
    public ?float $top_score;
    public string $started_at;
    public ?string $ended_at;
    public bool $has_clip;
    public bool $has_snapshot;
    public ?string $title;
    public ?string $description;
    public ?string $genai_severity;
    public bool $seen;

    /**
     * @param list<string> $zones
     * @param list<string> $derived_tags
     */
    public function __construct(
        string $id,
        string $camera,
        string $severity,
        string $label,
        ?string $sub_label,
        array $zones,
        array $derived_tags,
        ?float $top_score,
        string $started_at,
        ?string $ended_at,
        bool $has_clip,
        bool $has_snapshot,
        ?string $title,
        ?string $description,
        ?string $genai_severity,
        bool $seen,
    ) {
        $this->id = $id;
        $this->camera = $camera;
        $this->severity = $severity;
        $this->label = $label;
        $this->sub_label = $sub_label;
        $this->zones = $zones;
        $this->derived_tags = $derived_tags;
        $this->top_score = $top_score;
        $this->started_at = $started_at;
        $this->ended_at = $ended_at;
        $this->has_clip = $has_clip;
        $this->has_snapshot = $has_snapshot;
        $this->title = $title;
        $this->description = $description;
        $this->genai_severity = $genai_severity;
        $this->seen = $seen;
    }
}
