<?php

declare(strict_types=1);

namespace App\Controller;

use App\DTO\MotionDetectedFileInputDTO;
use App\Entity\MotionDetectedFile;
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
    #[Route('/motion-detected-file', name: 'api_motion_detected_file', methods: ['POST'])]
    public function index(Request $request, EntityManagerInterface $entity_manager): Response
    {

        try {
            $conn = $entity_manager->getConnection();
            $conn->connect();
            echo "Connection successful!";
        } catch (\Exception $e) {
            echo "Connection failed: " . $e->getMessage();
        }

        dd(1);
        /** @var MotionDetectedFileInputDTO $motion_detected_file_dto */
        $motion_detected_file_dto = $this->validateRequest($request, MotionDetectedFileInputDTO::class);
        if ($motion_detected_file_dto instanceof Response)
        {
            return $motion_detected_file_dto;
        }
dd($motion_detected_file_dto);
        $motion_detected_file = MotionDetectedFile::createFromDTO($motion_detected_file_dto);
        $entity_manager->persist($motion_detected_file);
        $entity_manager->flush();
        // post here with file name & meta data ( size / type etc )
        return new JsonResponse([
            'message' => 'Motion detection file created successfully',
        ]);
    }
}
