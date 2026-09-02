<?php
/**
 * Standalone smoke test for NotificationRuleMatcher, exercising the exact rule table
 * from docs/v2/04-notifications.md#the-rules-engine, including the midnight-wrap case.
 * See bin/verify-media-token.php for why this is a standalone script and not PHPUnit.
 *
 *   docker run --rm -v "$(pwd)":/app -w /app --entrypoint php \
 *     motion-detection-app:latest bin/verify-notification-matcher.php
 */
require __DIR__ . '/../vendor/autoload.php';

use App\Entity\Event;
use App\Entity\NotificationRule;
use App\Entity\User;
use App\Enum\EventSeverityEnum;
use App\Enum\NotificationActionEnum;
use App\Service\NotificationRuleMatcher;

function assertTrue(bool $cond, string $msg): void {
    if (!$cond) { fwrite(STDERR, "FAIL: $msg\n"); exit(1); }
    echo "OK: $msg\n";
}

function makeEvent(string $camera, string $label, array $zones, ?string $subLabel = null, string $startedAt = '2026-09-02T14:00:00+00:00'): Event {
    $event = new Event('id-' . random_int(1, 999999), $camera, EventSeverityEnum::alert, $label, new DateTimeImmutable($startedAt));
    $event->setZones($zones);
    $event->setSubLabel($subLabel);
    return $event;
}

$user = new User();
$matcher = new NotificationRuleMatcher();

// --- The exact rule table from docs/v2/04-notifications.md#the-rules-engine ---
$ruleKnownResident = new NotificationRule($user, 1, NotificationActionEnum::silent);
$ruleKnownResident->setSubLabels(['bewoner']);

$ruleNightPerson = new NotificationRule($user, 2, NotificationActionEnum::priority);
$ruleNightPerson->setZone('pad');
$ruleNightPerson->setLabels(['person']);
$ruleNightPerson->setFromTime('23:00');
$ruleNightPerson->setToTime('06:00');

$ruleDayPerson = new NotificationRule($user, 3, NotificationActionEnum::notify);
$ruleDayPerson->setZone('pad');
$ruleDayPerson->setLabels(['person']);

$ruleStreet = new NotificationRule($user, 4, NotificationActionEnum::silent);
$ruleStreet->setZone('straat');

$rules = [$ruleKnownResident, $ruleNightPerson, $ruleDayPerson, $ruleStreet];

// 1. Known resident -> silent, regardless of zone/time
$decision = $matcher->match(makeEvent('voordeur', 'person', ['pad'], 'bewoner'), $rules);
assertTrue($decision->action === NotificationActionEnum::silent, 'recognised resident is silent');
assertTrue($decision->rule === $ruleKnownResident, 'matched the resident rule specifically');

// 2. Person in `pad` at 23:30 -> priority (night rule wins over the day rule below it)
$decision = $matcher->match(makeEvent('voordeur', 'person', ['pad'], null, '2026-09-02T23:30:00+00:00'), $rules);
assertTrue($decision->action === NotificationActionEnum::priority, 'person in pad at 23:30 is priority (night rule)');
assertTrue($decision->isPriority(), 'isPriority() agrees');

// 3. Person in `pad` at 02:00 -> priority (wraps midnight correctly)
$decision = $matcher->match(makeEvent('voordeur', 'person', ['pad'], null, '2026-09-02T02:00:00+00:00'), $rules);
assertTrue($decision->action === NotificationActionEnum::priority, 'person in pad at 02:00 is priority (midnight wrap)');

// 4. Person in `pad` at 14:00 -> normal notify (falls through the night rule to the day rule)
$decision = $matcher->match(makeEvent('voordeur', 'person', ['pad'], null, '2026-09-02T14:00:00+00:00'), $rules);
assertTrue($decision->action === NotificationActionEnum::notify, 'person in pad at 14:00 is a normal notify');
assertTrue($decision->shouldNotify(), 'shouldNotify() agrees');

// 5. Car in `straat` -> silent (recorded, never buzzes)
$decision = $matcher->match(makeEvent('voordeur', 'car', ['straat']), $rules);
assertTrue($decision->action === NotificationActionEnum::silent, 'car on straat is silent');
assertTrue(!$decision->shouldNotify(), 'shouldNotify() is false for silent');

// 6. Nothing matches at all -> default silent, no rule
$decision = $matcher->match(makeEvent('achtertuin', 'cat', []), $rules);
assertTrue($decision->action === NotificationActionEnum::silent, 'unmatched event defaults to silent');
assertTrue($decision->rule === null, 'unmatched event carries no rule (real default, not a fallback rule)');

// 7. Disabled rules are skipped even though they're in the list
$disabledRule = new NotificationRule($user, 0, NotificationActionEnum::notify);
$disabledRule->setEnabled(false);
$decision = $matcher->match(makeEvent('voordeur', 'person', ['pad'], null, '2026-09-02T14:00:00+00:00'), [$disabledRule, $ruleDayPerson]);
assertTrue($decision->rule === $ruleDayPerson, 'a disabled higher-priority rule is skipped');

echo "\nAll NotificationRuleMatcher checks passed.\n";
