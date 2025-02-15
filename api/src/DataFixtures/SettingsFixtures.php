<?php

namespace App\DataFixtures;

use App\Entity\Settings;
use App\Entity\User;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Common\DataFixtures\DependentFixtureInterface;
use Doctrine\Persistence\ObjectManager;

class SettingsFixtures extends Fixture implements DependentFixtureInterface
{
    public function load(ObjectManager $manager): void
    {
        /** @var User $user */
        $user = $this->getReference('admin', User::class);
        $settings = new Settings();
        $settings->setUser($user);
        $settings->setMotionThreshold(5000);
        $settings->setMaxDiskUsageInGb(100);
        $settings->setMaxRecordingDuration(60);
        $settings->setRecordingExtension(5);
        $settings->setDetectionAreaPoints([]);

        // Persist the user to the database
        $manager->persist($settings);

        // Flush the changes to the database
        $manager->flush();
    }

    public function getDependencies(): array
    {
        return [
            UserFixtures::class,
        ];
    }
}
