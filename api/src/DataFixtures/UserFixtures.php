<?php

namespace App\DataFixtures;

use App\Entity\MotionDetectedFile;
use App\Entity\User;
use App\Enum\MotionDetectedFileTypeEnum;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

class UserFixtures extends Fixture
{
    public function __construct(
        private UserPasswordHasherInterface $password_hasher
    )
    {
    }

    public function load(ObjectManager $manager): void
    {
        $user = new User();
        $user->setUsername('admin'); // Set user email
        $user->setRoles(['ROLE_USER']); // Set user roles

        // Hash the password and set it
        $hashedPassword = $this->password_hasher->hashPassword($user, 'admin');
        $user->setPassword($hashedPassword);

        // Persist the user to the database
        $manager->persist($user);

        // Flush the changes to the database
        $manager->flush();
        $this->addReference('admin', $user);
    }
}
