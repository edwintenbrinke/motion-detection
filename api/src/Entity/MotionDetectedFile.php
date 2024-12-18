<?php

namespace App\Entity;

use App\DTO\MotionDetectedFileInputDTO;
use App\Enum\MotionDetectedFileTypeEnum;
use App\Repository\MotionDetectedFileRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Validator\Constraints as Assert;
use App\Validator\Constraints as CustomAssert;

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

    #[ORM\Column(enumType: MotionDetectedFileTypeEnum::class)]
    #[Assert\NotBlank(message: 'Type cannot be blank')]
//    #[Assert\Choice(callback: [MotionDetectedFileTypeEnum::class, 'values'])]
    private MotionDetectedFileTypeEnum $type;

    #[ORM\Column]
    private \DateTimeImmutable $created_at;

    #[ORM\Column]
    private \DateTimeImmutable $updated_at;

    public function __construct(string $file_name, string $file_path, MotionDetectedFileTypeEnum $type, ?\DateTimeImmutable $created_at = null)
    {
        $this->file_name = $file_name;
        $this->file_path = $file_path;
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
            MotionDetectedFileTypeEnum::getEnum($input_dto->type)
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

    public function getType(): ?MotionDetectedFileTypeEnum
    {
        return $this->type;
    }

    public function setType(MotionDetectedFileTypeEnum $type): static
    {
        $this->type = $type;

        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->created_at;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updated_at;
    }
}
