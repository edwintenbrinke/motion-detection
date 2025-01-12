<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\MotionDetectedFile;
use App\Message\ProcessMotionDetectedFile;
use App\Service\FileHandler;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\File;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\Exception\ExceptionInterface;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

 #[Route('/api/video')]
class VideoController extends AbstractController
{
     #[Route('/upload', name: 'api_video_upload', methods: ['POST'])]
    public function uploadVideo(Request $request, EntityManagerInterface $entity_manager, MessageBusInterface $bus, string $private_recordings_folder): Response
    {
        if (!$request->files->has('file'))
        {
            return $this->json([
                'message' => 'No file uploaded'
            ], Response::HTTP_BAD_REQUEST);
        }

        /** @var UploadedFile $file */
        $file = $request->files->get('file');
        $original_file_name = $file->getClientOriginalName();
        $unique_file_name = FileHandler::getUniqueFileName($private_recordings_folder, $original_file_name);

        $file->move($private_recordings_folder, $unique_file_name);

        $motion_detected_file = MotionDetectedFile::createFromFile($unique_file_name, $private_recordings_folder);
        $entity_manager->persist($motion_detected_file);
        $entity_manager->flush();

        $bus->dispatch(new ProcessMotionDetectedFile($motion_detected_file->getId()));

        return $this->json(['message' => 'Motion successfully uploaded'], Response::HTTP_OK);
    }

    #[Route('/stream/{filename}', name: 'stream_recording')]
    public function getRecording(string $filename, Request $request, string $public_recordings_folder): Response
    {
        $filePath = sprintf('%s/%s', $public_recordings_folder, $filename);

        // Detailed file validation
        if (!file_exists($filePath)) {
            return new Response('File not found', Response::HTTP_NOT_FOUND);
        }

        $fileSize = filesize($filePath);

        // Use BinaryFileResponse for more reliable streaming
        $response = new BinaryFileResponse($filePath);
        $response->headers->set('Content-Type', 'video/mp4');
        $response->headers->set('Accept-Ranges', 'bytes');

        // Handle range requests
        $rangeHeader = $request->headers->get('Range');
        if ($rangeHeader) {
            try {
                preg_match('/bytes=(\d+)-(\d+)?/', $rangeHeader, $matches);
                $start = intval($matches[1]);
                $end = isset($matches[2]) ? intval($matches[2]) : ($fileSize - 1);

                $response->headers->set('Content-Range', sprintf('bytes %d-%d/%d', $start, $end, $fileSize));
                $response->headers->set('Content-Length', (string)($end - $start + 1));
                $response->setStatusCode(Response::HTTP_PARTIAL_CONTENT);
            } catch (\Exception $e) {
                // Log the error if needed
                return new Response('Invalid Range', Response::HTTP_REQUESTED_RANGE_NOT_SATISFIABLE);
            }
        }

        return $response;
    }

    #[Route('/recordings2/{filename}', name: 'stream_recording2')]
    public function alternativeStreamRecording(string $filename, Request $request): Response
    {
        $filePath = sprintf('%s/public/recordings/%s', $this->getParameter('kernel.project_dir'), $filename);

        // Validate file
        if (!file_exists($filePath)) {
            return new Response('File not found', Response::HTTP_NOT_FOUND);
        }

        $fileSize = filesize($filePath);

        // Streaming response with explicit chunk handling
        $response = new StreamedResponse(function() use ($filePath, $fileSize, $request) {
            // Open file handle
            $handle = fopen($filePath, 'rb');
            if ($handle === false) {
                error_log("Failed to open file: $filePath");
                return;
            }

            // Determine start and end for streaming
            $start = 0;
            $end = $fileSize - 1;

            // Parse range header
            $rangeHeader = $request->headers->get('Range');
            if ($rangeHeader) {
                preg_match('/bytes=(\d+)-(\d+)?/', $rangeHeader, $matches);
                $start = intval($matches[1]);
                $end = isset($matches[2]) ? intval($matches[2]) : ($fileSize - 1);
            }

            // Seek to start position
            fseek($handle, $start);

            // Stream in larger chunks
            $chunkSize = 1024 * 256; // 256KB chunks
            $bytesRemaining = $end - $start + 1;

            while (!feof($handle) && $bytesRemaining > 0) {
                $readSize = min($chunkSize, $bytesRemaining);
                $data = fread($handle, $readSize);

                if ($data === false) {
                    error_log("Failed to read file chunk");
                    break;
                }

                echo $data;
                $bytesRemaining -= strlen($data);

                // Force output
                if (ob_get_level() > 0) {
                    ob_flush();
                }
                flush();
            }

            fclose($handle);
        });

        // Set headers
        $response->headers->set('Content-Type', 'video/mp4');
        $response->headers->set('Accept-Ranges', 'bytes');
        $response->headers->set('Cache-Control', 'public, max-age=86400');

        return $response;
    }

    // Debug route to check file accessibility
    #[Route('/debug/{filename}', name: 'debug_recording')]
    public function debugRecording(string $filename): Response
    {
        $filePath = sprintf('%s/public/recordings/%s', $this->getParameter('kernel.project_dir'), $filename);

        if (!file_exists($filePath)) {
            return new Response('File not found', Response::HTTP_NOT_FOUND);
        }

        $fileInfo = [
            'path' => $filePath,
            'exists' => file_exists($filePath),
            'readable' => is_readable($filePath),
            'size' => filesize($filePath),
            'mime_type' => mime_content_type($filePath)
        ];

        return new Response(json_encode($fileInfo), Response::HTTP_OK, [
            'Content-Type' => 'application/json'
        ]);
    }
}