<?php

namespace App\DTO;

use App\Enum\MotionDetectedFileTypeEnum;
use Symfony\Component\Validator\Constraints as Assert;
use App\Validator\Constraints as CustomAssert;

class MotionDetectedFileInputDTO
{
    #[Assert\NotBlank(message: 'File name cannot be blank')]
    public string $file_name;

    #[Assert\NotBlank(message: 'File path cannot be blank')]
    public string $file_path;

    #[Assert\NotBlank(message: 'Type cannot be blank')]
    #[Assert\Choice(callback: [MotionDetectedFileTypeEnum::class, 'getValues'])]
//    #[Assert\Choice(callback: [MotionDetectedFileTypeEnum::class, 'values'])]
    public int $type;
}
