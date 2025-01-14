<?php

namespace App\MessageHandler;

use App\Entity\MotionDetectedFile;
use App\Message\FileCleanupMessage;
use App\Repository\MotionDetectedFileRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
class FileCleanupMessageHandler
{
    private MotionDetectedFileRepository $file_repository;
    private EntityManagerInterface $entity_manager;

    public function __construct(MotionDetectedFileRepository $file_repository, EntityManagerInterface $entity_manager)
    {
        $this->file_repository = $file_repository;
        $this->entity_manager = $entity_manager;
    }

    public function __invoke(FileCleanupMessage $message)
    {
        $size_threshold = $message->getSizeThreshold() * 1024 * 1024 * 1024; // format 100GB to bytes
        $total_file_size = $this->file_repository->getTotalFileSize($message->getType());

        if ($total_file_size <= $size_threshold)
        {
            return false;
        }
//dd($total_file_size, $size_threshold);
        $batch_size = 100;
        $offset = 0;
        while ($total_file_size > $size_threshold) {
            // Get the files ordered by oldest first, limiting to 100 files per batch
            $files = $this->file_repository->findFilesOrderedByDateWithLimit($message->getType(), $batch_size, $offset);

            // If no files are left, break the loop
            if (empty($files)) {
                break;
            }

            foreach ($files as $file) {
                // Remove the file from disk
                if (file_exists($file->getFullFilePath())) {
                    unlink($file->getFullFilePath());
                }

                // Remove the entity
                $this->entity_manager->remove($file);

                // Update the total size
                $total_file_size -= $file->getFileSize();

                // Break if the threshold is reached
                if ($total_file_size <= $size_threshold) {
                    break;
                }
            }

            // Move the offset for the next batch
            $offset += $batch_size;

            // Flush the changes in batches to avoid memory overload
            $this->entity_manager->flush();
        }
        dd($size_threshold, $total_file_size);
    }
}
