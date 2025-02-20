<?php

namespace App\DTO\MotionDetectedFile;

use App\Enum\MotionDetectedFileTypeEnum;
use Symfony\Component\Validator\Constraints as Assert;

class MotionDetectedFileInputDTO
{
    #[Assert\NotBlank(message: 'File name cannot be blank')]
    public string $file_name;

    #[Assert\NotBlank(message: 'File path cannot be blank')]
    public string $file_path;

    #[Assert\NotBlank(message: 'Type cannot be blank')]
    #[Assert\Choice(callback: [MotionDetectedFileTypeEnum::class, 'getValues'])]
    public int $type;

    public function getFileName(): string
    {
        return $this->file_name;
    }

    public function setFileName(string $file_name): void
    {
        $this->file_name = $file_name;
    }

    public function getFilePath(): string
    {
        return $this->file_path;
    }

    public function setFilePath(string $file_path): void
    {
        $this->file_path = $file_path;
    }

    public function getType(): int
    {
        return $this->type;
    }

    public function setType(int $type): void
    {
        $this->type = $type;
    }
}
