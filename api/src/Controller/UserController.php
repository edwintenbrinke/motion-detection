<?php

declare(strict_types=1);

namespace App\Controller;

use App\DTO\Settings\SettingsImageRegionInputDTO;
use App\DTO\Settings\SettingsInputDTO;
use App\DTO\Settings\SettingsOutputDTO;
use App\Entity\Settings;
use App\Repository\SettingsRepository;
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
        $settings_dto = $this->validateRequest($request, SettingsImageRegionInputDTO::class);
        if ($settings_dto instanceof Response)
        {
            return $settings_dto;
        }

        $settings->updateFromImageRegionDTO($settings_dto);
        $entity_manager->flush();

        return $this->json(['message' => 'Settings updated.']);
    }
}