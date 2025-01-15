<?php

declare(strict_types=1);

namespace App\Controller;

use App\DTO\MotionDetectedFileCalendarOutputDTO;
use App\DTO\MotionDetectedFileInputDTO;
use App\DTO\MotionDetectedFileOutput2DTO;
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
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/motion-detected-file')]
class MotionDetectedFileController extends AbstractController
{
    use ValidationTrait;
    #[Route('/', name: 'api_motion_detected_file_post', methods: ['POST'])]
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

    #[Route('/table', name: 'api_motion_detected_file_get_table', methods: ['GET'])]
    public function getTableAction(Request $request, MotionDetectedFileRepository $detected_file_repo, PaginationService $service): Response
    {
        $page = (int)($request->query->get('page', 1));
        $items_per_page = (int)($request->query->get('itemsPerPage', 10));
        $search = $request->query->get('search', '');

        return $service->returnPaginatedSerializedResponse(
            $detected_file_repo->returnPaginatedTable($page, $items_per_page),
            MotionDetectedFileOutputDTO::class
        );
    }

    #[Route('/calendar', name: 'api_motion_detected_file_get_calendar', methods: ['GET'])]
    public function getCalendarAction(Request $request, MotionDetectedFileRepository $detected_file_repo): Response
    {
        $date = (string)($request->query->get('date'));

        if (!isset($date))
        {
            throw new BadRequestHttpException();
        }

        $data = $detected_file_repo->returnPaginatedCalendar(new \DateTime($date));
        $result = [];
        foreach ($data as $datum) {
            $serialized = $this->serializer->normalize($datum);
            $result[] = $this->serializer->denormalize($serialized, MotionDetectedFileCalendarOutputDTO::class);
        }
        return $this->json($result);
    }
}
