<?php

namespace App\DTO;

use App\Enum\MotionDetectedFileTypeEnum;
use Symfony\Component\Validator\Constraints as Assert;
use App\Validator\Constraints as CustomAssert;

class MotionDetectedFileOutputDTO
{
    public string $file_name;

    public string $file_path;

    public int $type;

    public \DateTimeImmutable $created_at;
}
