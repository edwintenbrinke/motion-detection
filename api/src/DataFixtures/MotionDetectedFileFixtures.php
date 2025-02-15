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
            'test.mp4',
            '/test.mp4',
            0,
            MotionDetectedFileTypeEnum::normal,
            $now = $this->remove30Minutes($now)
        );
        $manager->persist($motion_detected_file);
        $motion_detected_file2 = new MotionDetectedFile(
            'test2.mp4',
            '/test2.mp4',
            0,
            MotionDetectedFileTypeEnum::important,
            $now = $this->remove30Minutes($now)
        );
        $manager->persist($motion_detected_file2);
        $motion_detected_file2 = new MotionDetectedFile(
            'test3.mp4',
            '/test3.mp4',
            0,
            MotionDetectedFileTypeEnum::normal,
            $now = $this->remove30Minutes($now)
        );
        $manager->persist($motion_detected_file2);

        for ($i = 0; $i < 10; ++$i)
        {
            $motion_detected_file = new MotionDetectedFile(
                "file name $i",
                "file path $i",
                0,
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
