<?php

namespace App\Service;

use App\DTO\PaginatedResponseDTO;
use Doctrine\ORM\QueryBuilder;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Serializer\SerializerInterface;

class PaginationService
{
    private SerializerInterface $serializer;

    public function __construct(SerializerInterface $serializer)
    {
        $this->serializer = $serializer;
    }

    /**
     * Handles pagination for a given query builder and returns a PaginatedResponseDTO.
     *
     * @param  QueryBuilder         $query_builder
     * @param  int                  $page
     * @param  int                  $items_per_page
     * @param                       $search
     * @return PaginatedResponseDTO
     */
    public static function paginateQueryBuilder(QueryBuilder $query_builder, int $page, ?int $items_per_page = null): PaginatedResponseDTO
    {
        $query_builder
            ->setFirstResult(($page - 1) * $items_per_page);

        if (null !== $items_per_page)
        {
            $query_builder->setMaxResults($items_per_page);
        }

        $results = $query_builder->getQuery()->getResult();
        $aliases = $query_builder->getAllAliases();

        $totalItems = $query_builder
            ->select(sprintf('COUNT(%s.id)', $aliases[0]))
            ->setFirstResult(0)
            ->getQuery()
            ->getSingleScalarResult();

        $paginatedResponse = new PaginatedResponseDTO();
        $paginatedResponse->setData($results);
        $paginatedResponse->setTotal($totalItems);
        $paginatedResponse->setCurrentPage($page);
        $paginatedResponse->setItemsPerPage($items_per_page);

        return $paginatedResponse;
    }

    private function transformEntityToDTO(object $entity, string $dtoClass): object
    {
        $reflectionClass = new \ReflectionClass($dtoClass);

        $constructor = $reflectionClass->getConstructor();
        if (!$constructor)
        {
            throw new \InvalidArgumentException("The class $dtoClass must have a constructor.");
        }

        $parameters = $constructor->getParameters();
        $constructorArgs = [];

        foreach ($parameters as $parameter)
        {
            $name = $parameter->getName();
            $camelCaseName = $this->snakeToCamelCase($name);
            $getter = 'get' . ucfirst($camelCaseName);

            if (!method_exists($entity, $getter))
            {
                throw new \InvalidArgumentException('The entity class ' . get_class($entity) . " must have a method $getter to map to $dtoClass::$name.");
            }

            $constructorArgs[] = $entity->$getter();
        }

        return $reflectionClass->newInstanceArgs($constructorArgs);
    }

    private function snakeToCamelCase(string $snakeCase): string
    {
        return lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $snakeCase))));
    }

    public function returnPaginatedSerializedResponse(PaginatedResponseDTO $paginated_response_dto, string $output_data_dto_class, string $format = 'json')
    {
        $data = $paginated_response_dto->getData();
        $transformedData = [];

        foreach ($data as $entity)
        {
            $transformedData[] = $this->transformEntityToDTO($entity, $output_data_dto_class);
        }

        $response = [
            'data'         => $transformedData,
            'total'        => $paginated_response_dto->getTotal(),
            'currentPage'  => $paginated_response_dto->getCurrentPage(),
            'itemsPerPage' => $paginated_response_dto->getItemsPerPage(),
        ];

        return new Response(
            $this->serializer->serialize($response, $format),
            Response::HTTP_OK,
            ['Content-Type' => 'Application/json']
        );
    }
}
