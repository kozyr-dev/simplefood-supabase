import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../filters/error-response.dto';

/** The 404 of an admin route that takes `:id`. */
export const ApiAdminNotFound = (what: string) =>
  ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: `No such ${what}.`,
  });

/** A 409 with its codes, e.g. a slug in use (`details` name the field). */
export const ApiAdminConflict = (description: string) =>
  ApiConflictResponse({ type: ErrorResponseDto, description });

/** An admin delete: 204, or 404 for an unknown id. */
export const ApiAdminDeleted = (what: string) =>
  applyDecorators(
    ApiNoContentResponse({ description: `The ${what} is deleted.` }),
    ApiAdminNotFound(what),
  );
