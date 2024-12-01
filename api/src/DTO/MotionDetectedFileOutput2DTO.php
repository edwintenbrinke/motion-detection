<?php

namespace App\DTO;

use App\Enum\MotionDetectedFileTypeEnum;
use Symfony\Component\Validator\Constraints as Assert;
use App\Validator\Constraints as CustomAssert;

class MotionDetectedFileOutput2DTO
{
    public int $id;
    public string $file_name;

    public string $file_path;

    public MotionDetectedFileTypeEnum $type;

    public \DateTimeImmutable $created_at;

    public function getId(): int
    {
        return $this->id;
    }

    public function setId(int $id): void
    {
        $this->id = $id;
    }

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

    public function getType(): MotionDetectedFileTypeEnum
    {
        return $this->type;
    }

    public function setType(MotionDetectedFileTypeEnum $type): void
    {
        $this->type = $type;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->created_at;
    }

    public function setCreatedAt(\DateTimeImmutable $created_at): void
    {
        $this->created_at = $created_at;
    }
}
