<?php

namespace App\DTO\Settings;

use Symfony\Component\Validator\Constraints as Assert;

class SettingsImageRegionInputDTO
{
    #[Assert\NotBlank(message: 'Detection area points cannot be blank')]
    public array $detection_area_points;

    public function getDetectionAreaPoints(): array
    {
        return $this->detection_area_points;
    }

    public function setDetectionAreaPoints(array $detection_area_points): void
    {
        $this->detection_area_points = $detection_area_points;
    }
}
