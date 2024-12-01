<?php

namespace App\Service;

use App\DTO\PaginatedResponseDTO;
use Doctrine\ORM\QueryBuilder;
use ReflectionClass;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Serializer\Normalizer\AbstractNormalizer;
use Symfony\Component\Serializer\Normalizer\ObjectNormalizer;
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
     * @param QueryBuilder $query_builder
     * @param int $page
     * @param int $items_per_page
     * @param $search
     * @return PaginatedResponseDTO
     */
    public static function paginateQueryBuilder(QueryBuilder $query_builder, int $page, int $items_per_page): PaginatedResponseDTO
    {
        $query_builder
            ->setFirstResult(($page - 1) * $items_per_page)
            ->setMaxResults($items_per_page);

        $results = $query_builder->getQuery()->getResult();
        $aliases = $query_builder->getAllAliases();

        $totalItems = $query_builder->select(sprintf('COUNT(%s.id)', $aliases[0]))->getQuery()->getSingleScalarResult();

        $paginatedResponse = new PaginatedResponseDTO();
        $paginatedResponse->setData($results);
        $paginatedResponse->setTotal($totalItems);
        $paginatedResponse->setCurrentPage($page);
        $paginatedResponse->setItemsPerPage($items_per_page);

        return $paginatedResponse;
    }

    public function returnPaginatedSerializedResponse(PaginatedResponseDTO $paginated_response_dto, string $output_data_dto_class, string $format = 'json')
    {
//        $data_dto = [];
//        foreach ($paginated_response_dto->getData() as $result)
//        {
//            // Normalize the entity to an array using ObjectNormalizer
//            $objectNormalizer = new ObjectNormalizer();
//            $normalizedArray = $objectNormalizer->normalize($result);
//
//// Generate mapping dynamically based on the DTO class and source data
//            $propertyMapping = $this->createPropertyMapping($output_data_dto_class, $normalizedArray);
//
//// Create a new DTO instance and populate it
//            $normalizedData = $this->serializer->normalize($normalizedArray, null, [
//                AbstractNormalizer::OBJECT_TO_POPULATE => new $output_data_dto_class(),
//                AbstractNormalizer::ATTRIBUTES => $propertyMapping
//            ]);
//
//            dd( $normalizedData, $this->serializer->normalize($result, null, [
//                AbstractNormalizer::OBJECT_TO_POPULATE => new $output_data_dto_class(),
//            ]));
//            $data_dto[] = $output_data_class;
//        }

        return new Response(
            $this->serializer->serialize($paginated_response_dto, $format),
            Response::HTTP_OK,
            ['Content-Type' => 'Application/json']
        );
    }

    function createPropertyMapping(string $dtoClass, array $sourceData): array {
        $reflection = new ReflectionClass($dtoClass);
        $dtoProperties = $reflection->getProperties(); // Get properties of the DTO class

        $mapping = [];
        foreach ($dtoProperties as $property) {
            $propertyName = $property->getName();
            $camelCaseName = lcfirst(implode('', array_map('ucfirst', explode('_', $propertyName))));

            // Check if the source data contains a matching property name
            if (array_key_exists($camelCaseName, $sourceData)) {
                $mapping[$propertyName] = $camelCaseName;
            }
        }

        return $mapping;
    }
}