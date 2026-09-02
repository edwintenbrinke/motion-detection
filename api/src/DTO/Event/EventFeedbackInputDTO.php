<?php

namespace App\DTO\Event;

use Symfony\Component\Validator\Constraints as Assert;

class EventFeedbackInputDTO
{
    #[Assert\NotBlank(message: 'Feedback cannot be blank')]
    public string $feedback;

    public function getFeedback(): string
    {
        return $this->feedback;
    }
}
