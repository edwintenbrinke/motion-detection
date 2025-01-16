<?php

namespace App\DTO\Settings;

class SettingsOutputDTO
{
    public int $id;
    public int $motion_threshold;
    public int $recording_extension;
    public int $max_recording_duration;
    public int $max_disk_usage_in_gb;
    public array $detection_area_points;
    public \DateTimeImmutable $created_at;
    public \DateTimeImmutable $updated_at;

    public function __construct(int $id, int $motion_threshold, int $recording_extension, int $max_recording_duration, int $max_disk_usage_in_gb, array $detection_area_points, \DateTimeImmutable $created_at, \DateTimeImmutable $updated_at)
    {
        $this->id = $id;
        $this->motion_threshold = $motion_threshold;
        $this->recording_extension = $recording_extension;
        $this->max_recording_duration = $max_recording_duration;
        $this->max_disk_usage_in_gb = $max_disk_usage_in_gb;
        $this->detection_area_points = $detection_area_points;
        $this->created_at = $created_at;
        $this->updated_at = $updated_at;
    }
}
