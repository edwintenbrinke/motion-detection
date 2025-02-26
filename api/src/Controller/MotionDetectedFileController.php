<?php

declare(strict_types=1);

namespace App\Controller;

use App\DTO\MotionDetectedFile\MotionDetectedFileCalendarOutputDTO;
use App\DTO\MotionDetectedFile\MotionDetectedFileInputDTO;
use App\Entity\MotionDetectedFile;
use App\Enum\MotionDetectedFileTypeEnum;
use App\Repository\MotionDetectedFileRepository;
use App\Trait\ValidationTrait;
use Doctrine\ORM\EntityManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[OA\Tag(name: 'Motion detected files')]
#[Route('/api/motion-detected-file')]
class MotionDetectedFileController extends AbstractController
{
    use ValidationTrait;

    #[OA\Post(
        summary: 'Create a new motion detected file',
        requestBody: new OA\RequestBody(content: new Model(type: MotionDetectedFileInputDTO::class)),
        responses: [
            new OA\Response(response: 201, description: 'Motion detection file created successfully'),
            new OA\Response(response: 400, description: 'Validation failed')
        ]
    )]
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

    #[OA\Get(
        summary: 'Get hourly motion detected file counts for a specific date',
        parameters: [
            new OA\Parameter(name: 'date', in: 'path', required: true, schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'since', in: 'query', schema: new OA\Schema(type: 'string', format: 'date-time')),
            new OA\Parameter(name: 'important', in: 'query', schema: new OA\Schema(type: 'boolean'))
        ],
        responses: [
            new OA\Response(response: 200, description: 'Hourly counts of motion detected files')
        ]
    )]
    #[Route('/calendar/{date}', name: 'api_motion_detected_file_get_calendar_day', methods: ['GET'])]
    public function getCalendarDayAction(Request $request, MotionDetectedFileRepository $detected_file_repo, string $date): Response
    {
        $since = $request->query->get('since');
        try
        {
            $since = $since ? new \DateTime($since) : (new \DateTime($date))->setTime(0, 0);
            $end_of_day = (new \DateTime($date))->setTime(23, 59, 59);

            if ($since->format('Y-m-d') !== $end_of_day->format('Y-m-d'))
            {
                $since = (new \DateTime($date))->setTime(0, 0);
            }
        }
        catch (\Exception $e)
        {
            return $this->json(['error' => 'Invalid datetime format'], Response::HTTP_BAD_REQUEST);
        }

        $type_enum = $request->query->has('important') ? MotionDetectedFileTypeEnum::important : MotionDetectedFileTypeEnum::normal;

        $hourly_counts = $detected_file_repo->countItemsPerHour($since, $end_of_day, $type_enum);

        arsort($hourly_counts);

        return $this->json(array_values($hourly_counts));
    }

    #[OA\Get(
        summary: 'Get motion detected files for a specific date and hour',
        parameters: [
            new OA\Parameter(name: 'date', in: 'path', required: true, schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'hour', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'important', in: 'query', schema: new OA\Schema(type: 'boolean'))
        ],
        responses: [
            new OA\Response(response: 200, description: 'Motion detected files for the given hour')
        ]
    )]
    #[Route('/calendar/{date}/{hour}', name: 'api_motion_detected_file_get_calendar_day_hour', methods: ['GET'])]
    public function getCalendarDayHourAction(Request $request, MotionDetectedFileRepository $detected_file_repo, string $date, int $hour): Response
    {
        try
        {
            $start_date = (new \DateTime($date))->setTime($hour, 0);
            $end_date = (clone $start_date)->setTime($hour + 1, 0);
        }
        catch (\Exception $e)
        {
            return $this->json(['error' => 'Invalid datetime format'], 400);
        }
        $type_enum = $request->query->has('important') ? MotionDetectedFileTypeEnum::important : MotionDetectedFileTypeEnum::normal;

        $data = $detected_file_repo->returnPaginatedCalendar($start_date, $end_date, $type_enum);
        return $this->json(
            $this->serializeEntityArrayToDTOs($data, MotionDetectedFileCalendarOutputDTO::class)
        );
    }
}
