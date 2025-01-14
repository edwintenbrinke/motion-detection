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
    public function __construct(EntityManagerInterface $entity_manager, LoggerInterface $conversion_logger, string $public_recordings_folder, string $ffmpeg_path = '/usr/bin/ffmpeg')
    {
        $this->public_recordings_folder = $public_recordings_folder;
        $this->conversion_logger = $conversion_logger;
        $this->entity_manager = $entity_manager;
        $this->ffmpeg_path = $ffmpeg_path;
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
            'input' => $input_file_path,
            'output' => $output_file_path,
        ]);

        // Construct the FFmpeg command to convert the H264 video to MP4
        $process = new Process([
            $this->ffmpeg_path,
            '-i', $input_file_path, // Input file
            '-c:v', 'libx264',      // Video codec
            '-c:a', 'aac',          // Audio codec
            '-strict', 'experimental', // To allow experimental codecs if needed
            $output_file_path       // Output file
        ]);

        try {
            // Log the command being run (for debugging purposes)
            $this->conversion_logger->debug("Running FFmpeg command: " . $process->getCommandLine());

            $process->mustRun();  // Executes the command and throws an exception if the command fails

            // Log successful conversion
            $this->conversion_logger->info("Conversion successful: $output_file_path", [
                'input' => $input_file_path,
                'output' => $output_file_path,
            ]);

            unlink($input_file_path);

            return true;
        } catch (ProcessFailedException $exception) {
            // Log the failure with the exception details
            $this->conversion_logger->error("Conversion failed: $input_file_path", [
                'exception' => $exception->getMessage(),
                'input' => $input_file_path,
                'output' => $output_file_path,
            ]);

            return false;
        }
    }
}