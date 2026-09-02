<?php

namespace App\Entity;

use App\Repository\DeviceRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * One registered push-notification target. See docs/v2/04-notifications.md#device-registration.
 */
#[ORM\Entity(repositoryClass: DeviceRepository::class)]
#[ORM\UniqueConstraint(name: 'UNIQ_DEVICE_TOKEN', fields: ['token'])]
class Device
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private User $user;

    /** The FCM registration token. */
    #[ORM\Column(length: 512)]
    private string $token;

    #[ORM\Column(length: 32)]
    private string $platform;

    #[ORM\Column(length: 32, nullable: true)]
    private ?string $app_version = null;

    #[ORM\Column]
    private \DateTimeImmutable $last_seen;

    /**
     * Set to false rather than deleting the row when FCM reports UNREGISTERED, so the
     * "why did notifications stop" trail survives. See docs/v2/04-notifications.md.
     */
    #[ORM\Column]
    private bool $enabled = true;

    #[ORM\Column]
    private \DateTimeImmutable $created_at;

    public function __construct(User $user, string $token, string $platform)
    {
        $this->user = $user;
        $this->token = $token;
        $this->platform = $platform;
        $this->last_seen = new \DateTimeImmutable();
        $this->created_at = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getToken(): string
    {
        return $this->token;
    }

    public function setToken(string $token): void
    {
        $this->token = $token;
    }

    public function getPlatform(): string
    {
        return $this->platform;
    }

    public function setPlatform(string $platform): void
    {
        $this->platform = $platform;
    }

    public function getAppVersion(): ?string
    {
        return $this->app_version;
    }

    public function setAppVersion(?string $app_version): void
    {
        $this->app_version = $app_version;
    }

    public function getLastSeen(): \DateTimeImmutable
    {
        return $this->last_seen;
    }

    public function touch(): void
    {
        $this->last_seen = new \DateTimeImmutable();
    }

    public function isEnabled(): bool
    {
        return $this->enabled;
    }

    public function setEnabled(bool $enabled): void
    {
        $this->enabled = $enabled;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->created_at;
    }
}
