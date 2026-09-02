<?php

namespace App\DTO\Device;

use Symfony\Component\Validator\Constraints as Assert;

class DeviceInputDTO
{
    #[Assert\NotBlank(message: 'Token cannot be blank')]
    public string $token;

    #[Assert\NotBlank(message: 'Platform cannot be blank')]
    #[Assert\Choice(choices: ['android', 'ios', 'web'], message: 'Platform must be one of android, ios, web')]
    public string $platform;

    public ?string $app_version = null;

    public function getToken(): string
    {
        return $this->token;
    }

    public function getPlatform(): string
    {
        return $this->platform;
    }

    public function getAppVersion(): ?string
    {
        return $this->app_version;
    }
}
