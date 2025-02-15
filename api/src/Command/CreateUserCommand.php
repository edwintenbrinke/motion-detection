<?php

namespace App\Command;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

class CreateUserCommand extends Command
{
    public function __construct(
        private EntityManagerInterface $entity_manager,
        private UserPasswordHasherInterface $password_hasher
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->setName('app:user:create')
            ->setDescription('Creates a new user');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $username = $io->ask('Username');
        $password = $io->askHidden('Password');

        $user = new User();
        $user->setUsername($username);
        $user->setRoles(['ROLE_USER']);

        $hashedPassword = $this->password_hasher->hashPassword($user, $password);
        $user->setPassword($hashedPassword);

        $this->entity_manager->persist($user);
        $this->entity_manager->flush();

        $io->success('User created successfully!');

        return Command::SUCCESS;
    }
}
