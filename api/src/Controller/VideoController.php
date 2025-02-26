<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\MotionDetectedFile;
use App\Message\FileCleanupMessage;
use App\Message\ProcessFileMessage;
use App\Service\FileHandler;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\File;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\HttpClient\HttpClientInterface;

#[OA\Tag(name: 'Videos')]
#[Route('/api/video')]
class VideoController extends AbstractController
{
    #[OA\Post(
        summary: 'Upload a motion-detected video file.',
        requestBody: new OA\RequestBody(
            description: 'File upload',
            required: true,
            content: new OA\MediaType(
                mediaType: 'multipart/form-data',
                schema: new OA\Schema(
                    properties: [
                        new OA\Property(property: 'file', type: 'string', format: 'binary'),
                        new OA\Property(property: 'roi_triggered', type: 'boolean')
                    ]
                )
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Motion successfully uploaded'),
            new OA\Response(response: 400, description: 'No file uploaded'),
            new OA\Response(response: 500, description: 'File move failed')
        ]
    )]
    #[Route('/upload', name: 'api_video_upload', methods: ['POST'])]
    public function uploadVideo(Request $request, EntityManagerInterface $entity_manager, MessageBusInterface $bus, string $private_recordings_folder, int $max_disk_usage_size_gb): Response
    {
        if (!$request->files->has('file'))
        {
            return $this->json([
                'message' => 'No file uploaded'
            ], Response::HTTP_BAD_REQUEST);
        }

        $roi_triggered = $request->get('roi_triggered') === 'True';

        /** @var UploadedFile $file */
        $file = $request->files->get('file');
        $original_file_name = $file->getClientOriginalName();
        $unique_file_name = FileHandler::getUniqueFileName($private_recordings_folder, $original_file_name);

        // Move the file to the target directory
        $file_path = $private_recordings_folder . DIRECTORY_SEPARATOR . $unique_file_name;
        $file->move($private_recordings_folder, $unique_file_name);

        // Get the accurate file size using filesize() after moving the file
        if (!file_exists($file_path))
        {
            return $this->json([
                'message' => 'File move failed'
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $file_size = filesize($file_path);
        $motion_detected_file = MotionDetectedFile::createFromFile($unique_file_name, $private_recordings_folder, $file_size, $roi_triggered);
        $entity_manager->persist($motion_detected_file);
        $entity_manager->flush();

        $bus->dispatch(new ProcessFileMessage($motion_detected_file->getId()));
        $bus->dispatch(new FileCleanupMessage($max_disk_usage_size_gb, $motion_detected_file->getType()));

        return $this->json(['message' => 'Motion successfully uploaded'], Response::HTTP_OK);
    }

    #[OA\Get(
        summary: 'Stream a video file.',
        parameters: [
            new OA\Parameter(name: 'filename', in: 'path', required: true, schema: new OA\Schema(type: 'string'))
        ],
        responses: [
            new OA\Response(response: 200, description: 'Video stream'),
            new OA\Response(response: 404, description: 'File not found')
        ]
    )]
    #[Route('/stream/{filename}', name: 'stream_recording', methods: ['GET'])]
    public function get_recording(
        string $filename,
        Request $request,
        EntityManagerInterface $entity_manager
    ): Response {
        // Fetch the MotionDetectedFile entity by the file_name property
        $motion_detected_file = $entity_manager->getRepository(MotionDetectedFile::class)
            ->findOneBy(['file_name' => $filename]);

        if (!$motion_detected_file)
        {
            return new Response('File not found', Response::HTTP_NOT_FOUND);
        }

        // Construct the file path from the entity's data
        $file_path = $motion_detected_file->getFullFilePath();

        // Check if the file exists on the filesystem
        if (!file_exists($file_path))
        {
            return new Response('File not found', Response::HTTP_NOT_FOUND);
        }

        $file_size = filesize($file_path);
        $stream_response = new StreamedResponse();

        // Set headers
        $stream_response->headers->set('Content-Type', 'video/mp4'); // Adjust MIME type as needed
        $stream_response->headers->set('Accept-Ranges', 'bytes');

        // Handle range requests
        $range_header = $request->headers->get('Range');
        if ($range_header)
        {
            if (preg_match('/bytes=(\d+)-(\d+)?/', $range_header, $matches))
            {
                $start = intval($matches[1]);
                $end = isset($matches[2]) ? intval($matches[2]) : ($file_size - 1);

                if ($start >= $file_size || $end >= $file_size || $start > $end)
                {
                    return new Response('Invalid Range', Response::HTTP_REQUESTED_RANGE_NOT_SATISFIABLE);
                }

                $stream_response->headers->set('Content-Range', sprintf('bytes %d-%d/%d', $start, $end, $file_size));
                $stream_response->headers->set('Content-Length', (string)($end - $start + 1));
                $stream_response->setStatusCode(Response::HTTP_PARTIAL_CONTENT);

                // Stream only the requested range
                $stream_response->setCallback(function () use ($file_path, $start, $end)
                {
                    $handle = fopen($file_path, 'rb');
                    fseek($handle, $start);
                    $chunk_size = 8192; // Read in chunks to avoid memory issues
                    $remaining_bytes = $end - $start + 1;

                    while ($remaining_bytes > 0 && !feof($handle))
                    {
                        $bytes_to_read = min($chunk_size, $remaining_bytes);
                        echo fread($handle, $bytes_to_read);
                        flush();
                        $remaining_bytes -= $bytes_to_read;
                    }

                    fclose($handle);
                });
            }
        }
        else
        {
            // No range request, serve the full file
            $stream_response->headers->set('Content-Length', (string)$file_size);
            $stream_response->setCallback(function () use ($file_path)
            {
                readfile($file_path);
                flush();
            });
        }

        // Set the Content-Disposition to inline to allow in-browser playback
        $stream_response->headers->set('Content-Disposition', ResponseHeaderBag::DISPOSITION_INLINE);

        return $stream_response;
    }

    #[OA\Get(
        summary: 'Alternative video stream from a Raspberry Pi.',
        responses: [
            new OA\Response(response: 200, description: 'Streaming video')
        ]
    )]
    #[Route('/stream-alt', name: 'video_stream_alt', methods: ['GET'])]
    public function streamAlt(HttpClientInterface $client, string $raspberry_base_url): Response
    {
        return new StreamedResponse(function () use ($client, $raspberry_base_url)
        {
            $response = $client->request(
                'GET',
                $raspberry_base_url . '/video_feed',
                ['buffer' => false]
            );

            foreach ($client->stream($response) as $chunk)
            {
                echo $chunk->getContent();
                flush();
            }
        }, 200, [
            'Content-Type'  => 'multipart/x-mixed-replace; boundary=frame',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'Pragma'        => 'no-cache',
            'Expires'       => '0',
        ]);
    }

    #[OA\Get(
        summary: 'Debug file accessibility.',
        parameters: [
            new OA\Parameter(name: 'filename', in: 'path', required: true, schema: new OA\Schema(type: 'string'))
        ],
        responses: [
            new OA\Response(response: 200, description: 'File info retrieved successfully', content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'path', type: 'string'),
                    new OA\Property(property: 'exists', type: 'boolean'),
                    new OA\Property(property: 'readable', type: 'boolean'),
                    new OA\Property(property: 'size', type: 'integer'),
                    new OA\Property(property: 'mime_type', type: 'string')
                ]
            )),
            new OA\Response(response: 404, description: 'File not found')
        ]
    )]
    #[Route('/debug/{filename}', name: 'debug_recording', methods: ['GET'])]
    public function debugRecording(string $filename): Response
    {
        $filePath = sprintf('%s/public/recordings/%s', $this->getParameter('kernel.project_dir'), $filename);

        if (!file_exists($filePath))
        {
            return new Response('File not found', Response::HTTP_NOT_FOUND);
        }

        $fileInfo = [
            'path'      => $filePath,
            'exists'    => file_exists($filePath),
            'readable'  => is_readable($filePath),
            'size'      => filesize($filePath),
            'mime_type' => mime_content_type($filePath)
        ];

        return new Response(json_encode($fileInfo), Response::HTTP_OK, [
            'Content-Type' => 'application/json'
        ]);
    }
}
