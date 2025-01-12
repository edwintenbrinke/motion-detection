<?php

namespace App\Service;

use Symfony\Component\HttpFoundation\File\UploadedFile;

class FileHandler
{
    public static function getUniqueFileName($folder_path, $filename): string
    {
        $file_path = $folder_path . DIRECTORY_SEPARATOR . $filename;
        $extension = pathinfo($filename, PATHINFO_EXTENSION);
        $basename = pathinfo($filename, PATHINFO_FILENAME);
        $counter = 1;

        // Check if file already exists and modify the name
        while (file_exists($file_path)) {
            $new_filename = $basename . '-' . $counter . '.' . $extension;
            $file_path = $folder_path . DIRECTORY_SEPARATOR . $new_filename;
            $counter++;
        }

        return basename($file_path);
    }

}