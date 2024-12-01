<?php

declare(strict_types=1);

namespace App\Controller;

use App\DTO\MotionDetectedFileInputDTO;
use App\DTO\MotionDetectedFileOutputDTO;
use App\Entity\MotionDetectedFile;
use App\Repository\MotionDetectedFileRepository;
use App\Service\PaginationService;
use App\Trait\ValidationTrait;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Serializer\SerializerInterface;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[Route('/api')]
class MotionDetectedFileController extends AbstractController
{
    use ValidationTrait;
    #[Route('/motion-detected-file', name: 'api_motion_detected_file_post', methods: ['POST'])]
    public function createAction(Request $request, EntityManagerInterface $entity_manager): Response
    {
        /** @var MotionDetectedFileInputDTO $motion_detected_file_dto */
        $motion_detected_file_dto = $this->validateRequest($request, MotionDetectedFileInputDTO::class);
        if ($motion_detected_file_dto instanceof Response)
        {
            return $motion_detected_file_dto;
        }

        $motion_detected_file = MotionDetectedFile::createFromDTO($motion_detected_file_dto);
        $entity_manager->persist($motion_detected_file);
        $entity_manager->flush();

        return new JsonResponse([
            'message' => 'Motion detection file created successfully',
        ]);
    }

    #[Route('/motion-detected-file', name: 'api_motion_detected_file_get', methods: ['GET'])]
    public function getAction(Request $request, MotionDetectedFileRepository $detected_file_repo, PaginationService $service): Response
    {
        $page = (int)($request->query->get('page', 1));
        $items_per_page = (int)($request->query->get('itemsPerPage', 10));
        $search = $request->query->get('search', '');

        return $service->returnPaginatedSerializedResponse(
            $detected_file_repo->returnPaginated($page, $items_per_page),
            MotionDetectedFileOutputDTO::class
        );
    }
}
