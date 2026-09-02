<?php

namespace App\Enum;

/**
 * Mirrors Frigate's own review-item severity. See docs/v2/07-api-and-data-model.md.
 */
enum EventSeverityEnum: string
{
    case alert = 'alert';
    case detection = 'detection';
}
