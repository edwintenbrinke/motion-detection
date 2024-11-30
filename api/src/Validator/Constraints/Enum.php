<?php

namespace App\Validator\Constraints;

use Symfony\Component\Validator\Constraint;

/**
 * @Annotation
 */
class Enum extends Constraint
{
    public string $message = 'The value "{{ value }}" is not valid for the enumeration {{ enum }}.';
    public string $enumClass;
}
