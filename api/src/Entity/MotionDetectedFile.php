<?php

namespace App\Entity;

use App\DTO\MotionDetectedFile\MotionDetectedFileInputDTO;
use App\Enum\MotionDetectedFileTypeEnum;
use App\Repository\MotionDetectedFileRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: MotionDetectedFileRepository::class)]
class MotionDetectedFile
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    #[Assert\NotBlank(message: 'File name cannot be blank')]
    private string $file_name;

    #[ORM\Column]
    #[Assert\NotBlank(message: 'File path cannot be blank')]
    private string $file_path;

    #[ORM\Column(type: 'bigint')]
    #[Assert\NotBlank(message: 'File size cannot be blank')]
    #[Assert\PositiveOrZero(message: 'File size must be a positive number')]
    private int $file_size;

    #[ORM\Column(type: 'integer', nullable: true)]
    private int $video_duration;

    #[ORM\Column(type: 'integer', nullable: true)]
    private int $video_width;

    #[ORM\Column(type: 'integer', nullable: true)]
    private int $video_height;

    #[ORM\Column(enumType: MotionDetectedFileTypeEnum::class)]
    #[Assert\NotBlank(message: 'Type cannot be blank')]
    private MotionDetectedFileTypeEnum $type;

    #[ORM\Column]
    private bool $processed = false;

    #[ORM\Column]
    private \DateTimeImmutable $created_at;

    #[ORM\Column]
    private \DateTimeImmutable $updated_at;

    public function __construct(string $file_name, string $file_path, int $file_size, MotionDetectedFileTypeEnum $type, ?\DateTimeImmutable $created_at = null)
    {
        $this->file_name = $file_name;
        $this->file_path = $file_path;
        $this->file_size = $file_size;
        $this->type = $type;
        $this->created_at = $created_at ?? new \DateTimeImmutable();
        $this->updated_at = new \DateTimeImmutable();
        return $this;
    }

    public static function createFromDTO(MotionDetectedFileInputDTO $input_dto): self
    {
        return new self(
            $input_dto->file_name,
            $input_dto->file_path,
            0,
            MotionDetectedFileTypeEnum::getEnum($input_dto->type)
        );
    }

    public static function createFromFile(string $file_name, string $file_path, int $file_size, bool $roi_triggered): self
    {
        return new self(
            $file_name,
            $file_path,
            $file_size,
            $roi_triggered ? MotionDetectedFileTypeEnum::important : MotionDetectedFileTypeEnum::normal
        );
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getFileName(): ?string
    {
        return $this->file_name;
    }

    public function setFileName(string $file_name): static
    {
        $this->file_name = $file_name;

        return $this;
    }

    public function getFilePath(): ?string
    {
        return $this->file_path;
    }

    public function setFilePath(string $file_path): static
    {
        $this->file_path = $file_path;

        return $this;
    }

    public function getFileSize(): int
    {
        return $this->file_size;
    }

    public function setFileSize(int $file_size): void
    {
        $this->file_size = $file_size;
    }

    public function getFullFilePath(?string $file_name = null): string
    {
        $file_name = $file_name ?? $this->file_name;
        return rtrim($this->file_path, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $file_name;
    }

    public function getFileNameForMp4(): string
    {
        // Get the file info (path, filename, extension)
        $file_info = pathinfo($this->getFullFilePath());

        // Replace the file extension with .mp4
        return $file_info['filename'] . '.mp4';
    }

    public function getType(): ?MotionDetectedFileTypeEnum
    {
        return $this->type;
    }

    public function setType(MotionDetectedFileTypeEnum $type): static
    {
        $this->type = $type;

        return $this;
    }

    public function isProcessed(): bool
    {
        return $this->processed;
    }

    public function setProcessed(bool $processed): void
    {
        $this->processed = $processed;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->created_at;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updated_at;
    }

    public function getVideoDuration(): int
    {
        return $this->video_duration;
    }

    public function setVideoDuration(int $video_duration): void
    {
        $this->video_duration = $video_duration;
    }

    public function getVideoWidth(): int
    {
        return $this->video_width;
    }

    public function setVideoWidth(int $video_width): void
    {
        $this->video_width = $video_width;
    }

    public function getVideoHeight(): int
    {
        return $this->video_height;
    }

    public function setVideoHeight(int $video_height): void
    {
        $this->video_height = $video_height;
    }
}
