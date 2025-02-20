<?php

namespace App\DTO\MotionDetectedFile;

use App\Enum\MotionDetectedFileTypeEnum;

class MotionDetectedFileOutputDTO
{
    public string $file_name;

    public string $file_path;

    public MotionDetectedFileTypeEnum $type;

    public \DateTimeImmutable $created_at;

    public function __construct(string $file_name, string $file_path, MotionDetectedFileTypeEnum $type, \DateTimeImmutable $created_at)
    {
        $this->file_name = $file_name;
        $this->file_path = $file_path;
        $this->type = $type;
        $this->created_at = $created_at;
    }
}
