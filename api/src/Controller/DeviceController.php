<?php

declare(strict_types=1);

namespace App\Controller;

use App\DTO\Device\DeviceInputDTO;
use App\Entity\Device;
use App\Entity\User;
use App\Repository\DeviceRepository;
use App\Trait\ValidationTrait;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Push-notification device registration. See docs/v2/04-notifications.md#device-registration.
 */
#[OA\Tag(name: 'Devices')]
#[Route('/api/devices')]
class DeviceController extends AbstractController
{
    use ValidationTrait;

    #[OA\Post(
        summary: 'Register (or refresh) a push token for the current user',
        requestBody: new OA\RequestBody(),
        responses: [new OA\Response(response: 200, description: 'Registered')]
    )]
    #[Route('', name: 'api_devices_post', methods: ['POST'])]
    public function register(Request $request, EntityManagerInterface $entity_manager, DeviceRepository $device_repository): Response
    {
        $user = $this->getUser();
        if (!$user instanceof User)
        {
            throw $this->createAccessDeniedException();
        }

        $dto = $this->validateRequest($request, DeviceInputDTO::class);
        if ($dto instanceof JsonResponse)
        {
            return $dto;
        }

        // Same token registering again (token refresh, or a reinstall) updates in place
        // rather than creating a second row -- token has a unique constraint, see Device.
        $device = $device_repository->findOneByToken($dto->getToken());
        if ($device === null)
        {
            $device = new Device($user, $dto->getToken(), $dto->getPlatform());
            $entity_manager->persist($device);
        }
        else
        {
            $device->setPlatform($dto->getPlatform());
            $device->setAppVersion($dto->getAppVersion());
            $device->setEnabled(true);
            $device->touch();
        }

        $entity_manager->flush();

        return $this->json(['message' => 'Device registered', 'id' => $device->getId()]);
    }

    #[OA\Delete(
        summary: 'Unregister a device (logout, or the app clearing its token)',
        responses: [new OA\Response(response: 200, description: 'Unregistered')]
    )]
    #[Route('/{id}', name: 'api_devices_delete', methods: ['DELETE'])]
    public function unregister(Device $device, EntityManagerInterface $entity_manager): Response
    {
        $user = $this->getUser();
        if (!$user instanceof User || $user->getId() !== $device->getUser()->getId())
        {
            throw $this->createAccessDeniedException();
        }

        $entity_manager->remove($device);
        $entity_manager->flush();

        return $this->json(['message' => 'Device unregistered']);
    }
}
