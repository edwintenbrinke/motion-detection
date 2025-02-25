<?php

namespace App\Trait;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Serializer\Exception\NotNormalizableValueException;
use Symfony\Component\Serializer\SerializerInterface;
use Symfony\Component\Validator\Validator\ValidatorInterface;

trait ValidationTrait
{
    public SerializerInterface $serializer;
    public ValidatorInterface $validator;

    public function __construct(SerializerInterface $serializer, ValidatorInterface $validator)
    {
        $this->serializer = $serializer;
        $this->validator = $validator;
    }

    protected function serializeEntityArrayToDTOs(array $data, string $format = 'json'): array
    {
        $result = [];
        foreach ($data as $datum)
        {
            $result[] = $this->serializeEntityToDTO($datum, $format);
        }
        return $result;
    }

    protected function serializeEntityToDTO($data, string $format = 'json'): object
    {
        $serialized = $this->serializer->normalize($data);
        return $this->serializer->denormalize($serialized, $format);
    }

    protected function validateRequest(Request $request, string $class)
    {
        try
        {
            // Deserialize the request content into the given class
            $entity = $this->serializer->deserialize(
                $request->getContent(),
                $class,
                'json'
            );
        }
        catch (NotNormalizableValueException $exception)
        {
            // Handle specific deserialization errors (e.g., type mismatch)
            return new JsonResponse([
                'status'  => 'error',
                'message' => 'Invalid value for a field.',
                'details' => [
                    'property'      => $exception->getPath(),
                    'expected_type' => $exception->getExpectedTypes(),
                    'provided_type' => $exception->getCurrentType()
                ],
            ], Response::HTTP_BAD_REQUEST);
        }
        catch (\Exception $exception)
        {
            // Handle general JSON syntax errors
            return new JsonResponse([
                'status'  => 'error',
                'message' => 'Syntax error. JSON couldn\'t be decoded.',
            ], Response::HTTP_BAD_REQUEST);
        }

        // Validate the object
        $errors = $this->validator->validate($entity);
        if (count($errors) !== 0)
        {
            // Collect error messages for validation errors
            $error_messages = [];
            foreach ($errors as $error)
            {
                $error_messages[] = [
                    'property' => $error->getPropertyPath(),
                    'message'  => $error->getMessage(),
                ];
            }

            // Return validation errors
            return new JsonResponse([
                'status'  => 'error',
                'message' => 'Validation failed',
                'errors'  => $error_messages,
            ], Response::HTTP_BAD_REQUEST);
        }

        // No validation errors, return the validated entity
        return $entity;
    }

    /**
     * Validates an object and returns validation errors if any.
     *
     * @param  mixed              $object    The object to validate
     * @param  ValidatorInterface $validator The validator service
     * @return JsonResponse|null  Returns JsonResponse with errors if validation fails, null otherwise
     */
    protected function validateObject(mixed $object, ValidatorInterface $validator): ?JsonResponse
    {
        // If the object is not an entity or doesn't support validation, return null
        if (!is_object($object))
        {
            return new JsonResponse([
                'status'  => 'error',
                'message' => 'Invalid input: not an object'
            ], Response::HTTP_BAD_REQUEST);
        }

        // Validate the object
        $errors = $validator->validate($object);

        // Check if there are any validation errors
        if (count($errors) > 0)
        {
            // Collect error messages
            $error_messages = [];
            foreach ($errors as $error)
            {
                $error_messages[] = [
                    'property' => $error->getPropertyPath(),
                    'message'  => $error->getMessage()
                ];
            }

            // Return validation errors
            return new JsonResponse([
                'status'  => 'error',
                'message' => 'Validation failed',
                'errors'  => $error_messages
            ], Response::HTTP_BAD_REQUEST);
        }

        // No validation errors
        return null;
    }

    /**
     * Handles generic error responses
     *
     * @param  string       $message    Error message
     * @param  int          $statusCode HTTP status code
     * @return JsonResponse
     */
    protected function createErrorResponse(
        string $message,
        int $statusCode = Response::HTTP_INTERNAL_SERVER_ERROR
    ): JsonResponse {
        return new JsonResponse([
            'status'  => 'error',
            'message' => $message
        ], $statusCode);
    }

    /**
     * Creates a success response
     *
     * @param  string       $message    Success message
     * @param  array        $data       Additional data to include
     * @param  int          $statusCode HTTP status code
     * @return JsonResponse
     */
    protected function createSuccessResponse(
        string $message,
        array $data = [],
        int $statusCode = Response::HTTP_OK
    ): JsonResponse {
        return new JsonResponse([
            'status'  => 'success',
            'message' => $message,
            ...$data
        ], $statusCode);
    }
}
