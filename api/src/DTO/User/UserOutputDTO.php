<?php

namespace App\DTO\User;

class UserOutputDTO
{
    public int $id;
    public string $username;
    public \DateTimeImmutable $created_at;

    public function __construct(int $id, string $username, \DateTimeImmutable $created_at)
    {
        $this->id = $id;
        $this->username = $username;
        $this->created_at = $created_at;
    }
}
