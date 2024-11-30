<?php

namespace App\Enum;

enum MotionDetectedFileTypeEnum: int
{
    case normal = 0;
    case important = 1;

    public static function getValues(): array
    {
        return array_column(self::cases(), 'value');
    }

    public static function getEnum(int $enum_value): ?self
    {
        return self::cases()[$enum_value] ?? null;
    }
}
