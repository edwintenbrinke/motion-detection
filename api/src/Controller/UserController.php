<?php

declare(strict_types=1);

namespace App\Controller;

use App\DTO\Settings\SettingsImageRegionInputDTO;
use App\DTO\Settings\SettingsInputDTO;
use App\DTO\Settings\SettingsOutputDTO;
use App\DTO\User\UserOutputDTO;
use App\Entity\Settings;
use App\Entity\User;
use App\Repository\SettingsRepository;
use App\Service\RaspberryApiService;
use App\Trait\ValidationTrait;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/user')]
class UserController extends AbstractController
{
    use ValidationTrait;

    #[Route('/initialize', name: 'api_user_initialize_get', methods: ['GET'])]
    public function getUserInitialize(SettingsRepository $repository): Response
    {
        $user = $this->getUser();
        $settings = $repository->findOneBy(['user' => $user]);
        if (!$settings)
        {
            throw $this->createNotFoundException();
        }

        return $this->json([
            'user'     => $this->serializeEntityToDTO($user, UserOutputDTO::class),
            'settings' => $this->serializeEntityToDTO($settings, SettingsOutputDTO::class),
        ]);
    }

    #[Route('/settings', name: 'api_user_settings_get', methods: ['GET'])]
    public function getUserSettings(SettingsRepository $repository): Response
    {
        $user = $this->getUser();
        $settings = $repository->findOneBy(['user' => $user]);
        if (!$settings)
        {
            throw $this->createNotFoundException();
        }

        return $this->json($this->serializeEntityToDTO($settings, SettingsOutputDTO::class));
    }

    #[Route('/settings/{id}', name: 'api_user_settings_patch', methods: ['PATCH'])]
    public function patchUserSettings(Request $request, EntityManagerInterface $entity_manager, Settings $settings): Response
    {
        /** @var User $user */
        $user = $this->getUser();
        if ($user->getId() !== $settings->getUser()->getId())
        {
            throw $this->createAccessDeniedException();
        }

        $settings_dto = $this->validateRequest($request, SettingsInputDTO::class);
        if ($settings_dto instanceof Response)
        {
            return $settings_dto;
        }

        $settings->updateFromDTO($settings_dto);
        $entity_manager->flush();

        return $this->json(['message' => 'Settings updated.']);
    }

    #[Route('/settings/{id}/image-region', name: 'api_user_settings_image_region_patch', methods: ['PATCH'])]
    public function postUserSettingsImageRegion(Request $request, EntityManagerInterface $entity_manager, Settings $settings): Response
    {
        /** @var User $user */
        $user = $this->getUser();
        if ($user->getId() !== $settings->getUser()->getId())
        {
            throw $this->createAccessDeniedException();
        }

        $settings_dto = $this->validateRequest($request, SettingsImageRegionInputDTO::class);
        if ($settings_dto instanceof Response)
        {
            return $settings_dto;
        }

        $settings->updateFromImageRegionDTO($settings_dto);
        $entity_manager->flush();

        return $this->json(['message' => 'Settings updated.']);
    }

    #[Route('/settings/{id}/placeholder-image', name: 'api_user_settings_placeholder_image_set', methods: ['POST'])]
    public function postUserSettingsPlaceholderImage(Settings $settings, EntityManagerInterface $entity_manager, RaspberryApiService $raspberry_api_service, string $public_images_folder): Response
    {
        /** @var User $user */
        $user = $this->getUser();
        if ($user->getId() !== $settings->getUser()->getId())
        {
            throw $this->createAccessDeniedException();
        }

        $image_binary = $raspberry_api_service->fetchLatestFrame();
        if (!$image_binary)
        {
            throw $this->createNotFoundException();
        }

        $image_path = sprintf('%s/placeholder_%s.jpeg', $public_images_folder, $settings->getId());
        if (!file_put_contents($image_path, $image_binary))
        {
            throw $this->createAccessDeniedException();
        }

        $settings->setPlaceholderImageUrl($image_path);
        $entity_manager->flush();

        return $this->json(['message' => 'Settings updated.']);
    }
}
