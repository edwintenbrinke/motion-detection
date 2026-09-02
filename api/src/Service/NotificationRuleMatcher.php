<?php

namespace App\Service;

use App\Entity\Event;
use App\Entity\NotificationRule;
use App\Enum\NotificationActionEnum;

/**
 * The notification rules engine. See docs/v2/04-notifications.md#the-rules-engine.
 *
 * Rules are evaluated in the order given (callers pass them already sorted by priority
 * -- see NotificationRuleRepository::findForUserInPriorityOrder); the first enabled rule
 * whose matchers all agree with the event wins. No match at all means silent -- that is
 * the documented default, not a bug.
 *
 * Deliberately just logic: no repository, no HTTP client, no FCM call. Evaluating
 * "should this event notify" and "how do we deliver that" are two different jobs: this
 * class answers only the first one. See docs/v2/HANDOFF.md for what still calls this
 * (nothing yet -- the bridge/controller wiring is a follow-up).
 */
class NotificationRuleMatcher
{
    /**
     * @param list<NotificationRule> $rules already sorted by priority (ascending -- lower
     *                                       evaluates first). Disabled rules are skipped
     *                                       even if present in the list, so callers don't
     *                                       have to filter first.
     */
    public function match(Event $event, array $rules, ?\DateTimeImmutable $at = null): NotificationDecision
    {
        $at ??= $event->getStartedAt();

        foreach ($rules as $rule)
        {
            if ($rule->isEnabled() && $this->ruleMatches($rule, $event, $at))
            {
                return new NotificationDecision($rule->getAction(), $rule);
            }
        }

        return new NotificationDecision(NotificationActionEnum::silent, null);
    }

    private function ruleMatches(NotificationRule $rule, Event $event, \DateTimeImmutable $at): bool
    {
        if ($rule->getCamera() !== null && $rule->getCamera() !== $event->getCamera())
        {
            return false;
        }

        if ($rule->getZone() !== null && !in_array($rule->getZone(), $event->getZones(), true))
        {
            return false;
        }

        if ($rule->getLabels() !== [] && !in_array($event->getLabel(), $rule->getLabels(), true))
        {
            return false;
        }

        if ($rule->getSubLabels() !== [])
        {
            if ($event->getSubLabel() === null || !in_array($event->getSubLabel(), $rule->getSubLabels(), true))
            {
                return false;
            }
        }

        if (!$this->withinTimeWindow($rule->getFromTime(), $rule->getToTime(), $at))
        {
            return false;
        }

        return true;
    }

    /**
     * Both null: any time matches. Handles a window that wraps midnight (e.g.
     * from=23:00, to=06:00) -- see docs/v2/04-notifications.md's night-alert example.
     */
    private function withinTimeWindow(?string $from, ?string $to, \DateTimeImmutable $at): bool
    {
        if ($from === null && $to === null)
        {
            return true;
        }

        $nowMinutes = ((int) $at->format('H')) * 60 + (int) $at->format('i');
        $fromMinutes = $from !== null ? $this->toMinutes($from) : 0;
        $toMinutes = $to !== null ? $this->toMinutes($to) : (24 * 60 - 1);

        if ($fromMinutes <= $toMinutes)
        {
            return $nowMinutes >= $fromMinutes && $nowMinutes <= $toMinutes;
        }

        // Wraps midnight: e.g. 23:00-06:00 matches 23:30 AND 02:00.
        return $nowMinutes >= $fromMinutes || $nowMinutes <= $toMinutes;
    }

    private function toMinutes(string $hhmm): int
    {
        [$hours, $minutes] = array_map('intval', explode(':', $hhmm));
        return $hours * 60 + $minutes;
    }
}
