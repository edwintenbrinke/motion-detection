<?php

namespace App\Command;

use App\Entity\Settings;
use App\Entity\User;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Creates the account the app logs in with.
 *
 * Options as well as prompts, because on the cluster this is run through `kubectl exec`
 * where there is no TTY and `askHidden()` simply fails. Passing --password on a command
 * line puts it in shell history, so prefer the MOTION_USER_PASSWORD environment variable
 * when you have the choice.
 */
#[AsCommand(name: 'app:user:create', description: 'Creates (or updates the password of) a user')]
class CreateUserCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $entity_manager,
        private readonly UserPasswordHasherInterface $password_hasher,
        private readonly UserRepository $user_repository,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('username', 'u', InputOption::VALUE_REQUIRED, 'Username')
            ->addOption('password', 'p', InputOption::VALUE_REQUIRED, 'Password (prefer MOTION_USER_PASSWORD)')
            ->addOption('update', null, InputOption::VALUE_NONE, 'Reset the password if the user already exists');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $username = $input->getOption('username') ?: $io->ask('Username');
        $password = $input->getOption('password')
            ?: ($_SERVER['MOTION_USER_PASSWORD'] ?? null)
            ?: $io->askHidden('Password');

        if (!is_string($username) || $username === '' || !is_string($password) || $password === '')
        {
            $io->error('Both a username and a password are required.');

            return Command::FAILURE;
        }

        $existing = $this->user_repository->findOneBy(['username' => $username]);

        if ($existing !== null && !$input->getOption('update'))
        {
            $io->error(sprintf('User "%s" already exists. Pass --update to reset its password.', $username));

            return Command::FAILURE;
        }

        $user = $existing ?? new User();
        $user->setUsername($username);
        $user->setRoles(['ROLE_USER']);
        $user->setPassword($this->password_hasher->hashPassword($user, $password));
        $this->entity_manager->persist($user);

        // /api/user/initialize 404s without a Settings row, which reads to the app as a
        // broken login rather than as a missing record -- so the account is not usable
        // until this exists. Create it here instead of leaving a second manual step.
        $settings = $this->entity_manager->getRepository(Settings::class)->findOneBy(['user' => $user]);
        if ($settings === null)
        {
            $settings = new Settings();
            $settings->setUser($user);
            // v1 motion-detection numbers. Frigate owns detection now, so these only feed
            // the legacy screens; they exist so the row is valid, not because they matter.
            $settings->setMotionThreshold(5000);
            $settings->setRoiMotionThreshold(500);
            $settings->setMaxDiskUsageInGb(100);
            $settings->setMaxRecordingDuration(60);
            $settings->setRecordingExtension(5);
            $settings->setDetectionAreaPoints([]);
            $this->entity_manager->persist($settings);
        }

        $this->entity_manager->flush();

        $io->success(sprintf('%s "%s".', $existing ? 'Updated' : 'Created', $username));

        return Command::SUCCESS;
    }
}
