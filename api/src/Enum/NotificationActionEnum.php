<?php

namespace App\Enum;

/**
 * See docs/v2/04-notifications.md#the-rules-engine. Rules are evaluated in priority
 * order; the first match wins; the default (no rule matches) is silent.
 */
enum NotificationActionEnum: string
{
    case notify = 'notify';
    case silent = 'silent';
    case priority = 'priority';
}
