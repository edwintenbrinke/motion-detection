<?php

namespace App\DataFixtures;

use App\Entity\MotionDetectedFile;
use App\Enum\MotionDetectedFileTypeEnum;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;

class MotionDetectedFileFixtures extends Fixture
{
    public function load(ObjectManager $manager): void
    {
        $motion_detected_file = new MotionDetectedFile(
            'file name',
            'file path',
            MotionDetectedFileTypeEnum::normal,
        );
        $manager->persist($motion_detected_file);
        $motion_detected_file2 = new MotionDetectedFile(
            'file name important',
            'file path important',
            MotionDetectedFileTypeEnum::important,
        );
        $manager->persist($motion_detected_file2);

        $manager->flush();
    }
}
