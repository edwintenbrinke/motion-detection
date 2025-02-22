<?php

namespace App\DTO\Settings;

class SettingsOutputDTO
{
    public int $id;
    public int $motion_threshold;
    public int $roi_motion_threshold;
    public int $recording_extension;
    public int $max_recording_duration;
    public int $max_disk_usage_in_gb;
    public array $detection_area_points;
    public ?string $placeholder_image_url;

    public function __construct(int $id, int $motion_threshold, int $roi_motion_threshold, int $recording_extension, int $max_recording_duration, int $max_disk_usage_in_gb, array $detection_area_points, ?string $placeholder_image_url)
    {
        $this->id = $id;
        $this->motion_threshold = $motion_threshold;
        $this->roi_motion_threshold = $roi_motion_threshold;
        $this->recording_extension = $recording_extension;
        $this->max_recording_duration = $max_recording_duration;
        $this->max_disk_usage_in_gb = $max_disk_usage_in_gb;
        $this->detection_area_points = $detection_area_points;
        $this->placeholder_image_url = $placeholder_image_url;
    }
}
