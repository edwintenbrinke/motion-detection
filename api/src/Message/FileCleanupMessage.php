<?php

namespace App\Message;

use App\Enum\MotionDetectedFileTypeEnum;

class FileCleanupMessage
{
    private int $size_threshold;
    private MotionDetectedFileTypeEnum $type;

    public function __construct(int $size_threshold, MotionDetectedFileTypeEnum $type)
    {
        $this->size_threshold = $size_threshold;
        $this->type = $type;
    }

    public function getSizeThreshold(): int
    {
        return $this->size_threshold;
    }

    public function getType(): MotionDetectedFileTypeEnum
    {
        return $this->type;
    }
}