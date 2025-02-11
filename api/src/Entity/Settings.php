<?php

namespace App\Entity;

use App\DTO\Settings\SettingsImageRegionInputDTO;
use App\DTO\Settings\SettingsInputDTO;
use App\Repository\SettingsRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: SettingsRepository::class)]
class Settings
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\OneToOne(cascade: ['persist', 'remove'])]
    #[ORM\JoinColumn(nullable: false)]
    private ?User $user = null;

    #[ORM\Column]
    private int $motion_threshold;

    #[ORM\Column]
    private int $recording_extension;

    #[ORM\Column]
    private int $max_recording_duration;

    #[ORM\Column]
    private int $max_disk_usage_in_gb;

    #[ORM\Column]
    private array $detection_area_points;

    #[ORM\Column]
    private string $placeholder_image_url;

    #[ORM\Column]
    private \DateTimeImmutable $created_at;

    #[ORM\Column]
    private \DateTimeImmutable $updated_at;

    public function __construct()
    {
        $this->created_at = new \DateTimeImmutable();
        $this->updated_at = new \DateTimeImmutable();
    }

    public function updateFromDTO(SettingsInputDTO $input_dto): self
    {
        $this->setMotionThreshold($input_dto->getMotionThreshold());
        $this->setRecordingExtension($input_dto->getRecordingExtension());
        $this->setMaxRecordingDuration($input_dto->getMaxRecordingDuration());
        $this->setMaxDiskUsageInGb($input_dto->getMaxDiskUsageInGb());
        return $this;
    }

    public function updateFromImageRegionDTO(SettingsImageRegionInputDTO $input_dto): self
    {
        $this->setDetectionAreaPoints($input_dto->getDetectionAreaPoints());
        return $this;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUser(): ?User
    {
        return $this->user;
    }

    public function setUser(?User $user): void
    {
        $this->user = $user;
    }

    public function getMotionThreshold(): int
    {
        return $this->motion_threshold;
    }

    public function setMotionThreshold(int $motion_threshold): void
    {
        $this->motion_threshold = $motion_threshold;
    }

    public function getRecordingExtension(): int
    {
        return $this->recording_extension;
    }

    public function setRecordingExtension(int $recording_extension): void
    {
        $this->recording_extension = $recording_extension;
    }

    public function getMaxRecordingDuration(): int
    {
        return $this->max_recording_duration;
    }

    public function setMaxRecordingDuration(int $max_recording_duration): void
    {
        $this->max_recording_duration = $max_recording_duration;
    }

    public function getMaxDiskUsageInGb(): int
    {
        return $this->max_disk_usage_in_gb;
    }

    public function setMaxDiskUsageInGb(int $max_disk_usage_in_gb): void
    {
        $this->max_disk_usage_in_gb = $max_disk_usage_in_gb;
    }

    public function getDetectionAreaPoints(): array
    {
        return $this->detection_area_points;
    }

    public function setDetectionAreaPoints(array $detection_area_points): void
    {
        $this->detection_area_points = $detection_area_points;
    }

    public function getPlaceholderImageUrl(): string
    {
        return $this->placeholder_image_url;
    }

    public function setPlaceholderImageUrl(string $placeholder_image_url): void
    {
        $this->placeholder_image_url = $placeholder_image_url;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->created_at;
    }

    public function setCreatedAt(\DateTimeImmutable $created_at): void
    {
        $this->created_at = $created_at;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updated_at;
    }

    public function setUpdatedAt(\DateTimeImmutable $updated_at): void
    {
        $this->updated_at = $updated_at;
    }
}
