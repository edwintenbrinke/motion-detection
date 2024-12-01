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
        $now = new \DateTimeImmutable();
        $motion_detected_file = new MotionDetectedFile(
            'file name',
            'file path',
            MotionDetectedFileTypeEnum::normal,
            $now = $this->remove30Minutes($now)
        );
        $manager->persist($motion_detected_file);
        $motion_detected_file2 = new MotionDetectedFile(
            'file name important',
            'file path important',
            MotionDetectedFileTypeEnum::important,
            $now = $this->remove30Minutes($now)
        );
        $manager->persist($motion_detected_file2);

        for ($i = 0; $i < 1000; ++$i) {
            $motion_detected_file = new MotionDetectedFile(
                "file name $i",
                "file path $i",
                MotionDetectedFileTypeEnum::normal,
                $now = $this->remove30Minutes($now)
            );
            $manager->persist($motion_detected_file);
        }

        $manager->flush();
    }

    private function remove30Minutes(\DateTimeImmutable $date): \DateTimeImmutable
    {
        return $date->modify('-30 minutes');
    }
}
