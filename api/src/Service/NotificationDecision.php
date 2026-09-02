<?php

namespace App\Service;

use App\Entity\NotificationRule;
use App\Enum\NotificationActionEnum;

/**
 * Result of NotificationRuleMatcher::match(). `rule` is null when nothing matched (the
 * default-silent case) so callers can still explain *why* -- "no rule matched" versus
 * "rule #4 said silent" are different things to show in a debug view later.
 */
final class NotificationDecision
{
    public function __construct(
        public readonly NotificationActionEnum $action,
        public readonly ?NotificationRule $rule,
    ) {
    }

    public function shouldNotify(): bool
    {
        return $this->action !== NotificationActionEnum::silent;
    }

    public function isPriority(): bool
    {
        return $this->action === NotificationActionEnum::priority;
    }
}
