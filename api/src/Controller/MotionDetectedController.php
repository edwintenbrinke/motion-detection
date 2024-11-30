<?php

declare(strict_types=1);

namespace App\Controller;

use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class MotionDetectedController extends AbstractController
{
    #[Route('/motion-detected')]
    public function index(Request $request, EntityManagerInterface $entity_manager): Response
    {
        // post here with file name & meta data ( size / type etc )
        return $this->render('motion_detected/index.html.twig');
    }
}
