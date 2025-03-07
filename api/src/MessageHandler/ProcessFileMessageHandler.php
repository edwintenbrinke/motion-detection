<?php

namespace App\MessageHandler;

use App\Entity\MotionDetectedFile;
use App\Message\ProcessFileMessage;
use App\Service\FileHandler;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;

#[AsMessageHandler]
class ProcessFileMessageHandler
{
    private EntityManagerInterface $entity_manager;
    private LoggerInterface $conversion_logger;
    private string $public_recordings_folder;
    private string $ffmpeg_path;
    private bool $flip_vertical;

    public function __construct(EntityManagerInterface $entity_manager, LoggerInterface $conversion_logger, string $public_recordings_folder, string $ffmpeg_path = '/usr/bin/ffmpeg', bool $flip_vertical = true)
    {
        $this->public_recordings_folder = $public_recordings_folder;
        $this->conversion_logger = $conversion_logger;
        $this->entity_manager = $entity_manager;
        $this->ffmpeg_path = $ffmpeg_path;
        $this->flip_vertical = $flip_vertical;
    }

    public function __invoke(ProcessFileMessage $message)
    {
        $motion_detected_file = $this->entity_manager->getRepository(MotionDetectedFile::class)->find($message->getId());
        if (!$motion_detected_file)
        {
            return false;
        }

        $input_file_path = $motion_detected_file->getFullFilePath();

        $output_folder = rtrim($this->public_recordings_folder, DIRECTORY_SEPARATOR);
        $unique_file_name_mp4 = FileHandler::getUniqueFileName($output_folder, $motion_detected_file->getFileNameForMp4());
        $output_file_path = $output_folder . DIRECTORY_SEPARATOR . $unique_file_name_mp4;

        if (!$this->convertH264ToMp4($input_file_path, $output_file_path))
        {
            return false;
        }

        $this->getVideoMetadata($output_file_path, $motion_detected_file);
        $motion_detected_file->setProcessed(true);
        $motion_detected_file->setFileName($unique_file_name_mp4);
        $motion_detected_file->setFilePath($output_folder);
        $motion_detected_file->setFileSize(filesize($output_file_path));
        $this->entity_manager->flush();
        return true;
    }

    public function convertH264ToMp4(string $input_file_path, string $output_file_path): bool
    {
        // Log starting of conversion
        $this->conversion_logger->info("Starting conversion for file: $input_file_path", [
            'input'  => $input_file_path,
            'output' => $output_file_path,
        ]);

        // Construct the FFmpeg command
        $command = [
            $this->ffmpeg_path,
            '-i', $input_file_path, // Input file
            '-c:v', 'libx264',      // Video codec
            '-c:a', 'aac',          // Audio codec
            '-strict', 'experimental', // To allow experimental codecs if needed
        ];

        // Apply vertical flip filter if needed
        if ($this->flip_vertical)
        {
            $command[] = '-vf';
            $command[] = 'vflip';
        }

        // Add the output file path
        $command[] = $output_file_path;

        $process = new Process($command);

        try
        {
            // Log the command being run (for debugging purposes)
            $this->conversion_logger->debug('Running FFmpeg command: ' . $process->getCommandLine());

            $process->mustRun();  // Executes the command and throws an exception if the command fails

            // Log successful conversion
            $this->conversion_logger->info("Conversion successful: $output_file_path", [
                'input'  => $input_file_path,
                'output' => $output_file_path,
            ]);

            unlink($input_file_path);

            return true;
        }
        catch (ProcessFailedException $exception)
        {
            // Log the failure with the exception details
            $this->conversion_logger->error("Conversion failed: $input_file_path", [
                'exception' => $exception->getMessage(),
                'input'     => $input_file_path,
                'output'    => $output_file_path,
            ]);

            return false;
        }
    }

    private function getVideoMetadata(string $file_path, MotionDetectedFile $motion_detected_file): ?MotionDetectedFile
    {
        $process = new Process([
            '/usr/bin/ffprobe',  // Use ffprobe instead of ffmpeg
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,duration',
            '-of', 'json',
            $file_path
        ]);

        try
        {
            $process->mustRun();
            $output = json_decode($process->getOutput(), true);
            if (isset($output['streams'][0]))
            {
                $motion_detected_file->setVideoDuration((int)round($output['streams'][0]['duration']) ?? 0);
                $motion_detected_file->setVideoWidth((int)$output['streams'][0]['width'] ?? 0);
                $motion_detected_file->setVideoHeight((int)$output['streams'][0]['height'] ?? 0);
                return $motion_detected_file;
            }
        }
        catch (ProcessFailedException $exception)
        {
            $this->conversion_logger->error('Failed to retrieve video metadata', [
                'exception' => $exception->getMessage(),
                'file'      => $file_path,
            ]);
        }
        return null;
    }
}
