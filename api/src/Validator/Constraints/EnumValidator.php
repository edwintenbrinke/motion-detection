<?php

namespace App\Validator\Constraints;

use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use BackedEnum;
use UnexpectedValueException;

class EnumValidator extends ConstraintValidator
{
    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!in_array($value, array_column($constraint->enumClass::cases(), 'value'))) {
            $this->context->buildViolation($constraint->message)
                ->addViolation();
        }
    }
}

