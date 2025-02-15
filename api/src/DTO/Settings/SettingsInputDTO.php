<?php

namespace App\DTO\Settings;

use Symfony\Component\Validator\Constraints as Assert;

class SettingsInputDTO
{
    #[Assert\NotBlank(message: 'Motion threshold cannot be blank')]
    public int $motion_threshold;

    #[Assert\NotBlank(message: 'ROI Motion threshold cannot be blank')]
    public int $roi_motion_threshold;

    #[Assert\NotBlank(message: 'Recording extension cannot be blank')]
    public int $recording_extension;

    #[Assert\NotBlank(message: 'Max recording duration cannot be blank')]
    public int $max_recording_duration;

    #[Assert\NotBlank(message: 'Max disk usage in GB cannot be blank')]
    public int $max_disk_usage_in_gb;

    public function getMotionThreshold(): int
    {
        return $this->motion_threshold;
    }

    public function setMotionThreshold(int $motion_threshold): void
    {
        $this->motion_threshold = $motion_threshold;
    }

    public function getRoiMotionThreshold(): int
    {
        return $this->roi_motion_threshold;
    }

    public function setRoiMotionThreshold(int $roi_motion_threshold): void
    {
        $this->roi_motion_threshold = $roi_motion_threshold;
    }

    public function getRecordingExtension(): int
    {
        return $this->recording_extension;
    }

    public function setRecordingExtension(int $recording_extension): void
    {
        $this->recording_extension = $recording_extension;
    }

    public function getMaxRecordingDuration(): int
    {
        return $this->max_recording_duration;
    }

    public function setMaxRecordingDuration(int $max_recording_duration): void
    {
        $this->max_recording_duration = $max_recording_duration;
    }

    public function getMaxDiskUsageInGb(): int
    {
        return $this->max_disk_usage_in_gb;
    }

    public function setMaxDiskUsageInGb(int $max_disk_usage_in_gb): void
    {
        $this->max_disk_usage_in_gb = $max_disk_usage_in_gb;
    }
}
