<?php

namespace App\DTO\MotionDetectedFile;

use App\Enum\MotionDetectedFileTypeEnum;

class MotionDetectedFileCalendarOutputDTO
{
    public string $file_name;
    public ?int $video_duration;
    public MotionDetectedFileTypeEnum $type;
    public \DateTimeImmutable $created_at;

    public function __construct(string $file_name, MotionDetectedFileTypeEnum $type, \DateTimeImmutable $created_at, ?int $video_duration = null)
    {
        $this->file_name = $file_name;
        $this->type = $type;
        $this->created_at = $created_at;
        $this->video_duration = $video_duration;
    }
}
