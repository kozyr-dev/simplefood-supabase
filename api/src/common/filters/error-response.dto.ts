import { ApiPropertyOptional } from '@nestjs/swagger';
import type { ValidationErrorDetail } from '../validation/flatten-validation-errors';
import type { ErrorResponseBody } from './all-exceptions.filter';

/*
 * OpenAPI description of the error body AllExceptionsFilter sends. The
 * @nestjs/swagger CLI plugin documents these properties from their TypeScript
 * types and /** comments *\/ (this file ends in `.dto.ts`), so no @ApiProperty
 * is needed except where a type can't express it.
 *
 * `implements` keeps the docs honest: if the filter's ErrorResponseBody gains
 * or changes a field and these classes don't follow, `npm run typecheck` fails.
 */

export class ErrorDetailDto implements ValidationErrorDetail {
  /**
   * Dotted path to the invalid field.
   * @example items.0.quantity
   */
  field: string;

  /**
   * Every rule the field broke.
   * @example ["quantity must not be less than 1"]
   */
  messages: string[];
}

// `implements` needs a named type, not an indexed one.
type ErrorBody = ErrorResponseBody['error'];

export class ErrorDto implements ErrorBody {
  /**
   * HTTP status code, repeated in the body.
   * @example 400
   */
  status: number;

  /**
   * Machine-readable code to switch on: the HTTP status name (`BAD_REQUEST`,
   * `NOT_FOUND`, ...) or a domain code (`EMAIL_TAKEN`, ...).
   * @example BAD_REQUEST
   */
  code: string;

  /**
   * Human-readable summary. Never contains internal details: unexpected
   * errors always read "Internal server error".
   * @example "Validation failed"
   */
  message: string;

  /**
   * Same value as the `X-Request-Id` response header. Quote it when reporting
   * a problem; it identifies the request in the server logs.
   * @example 01a1559c-a1ed-4641-ac0e-64612b99bb5a
   */
  requestId: string;

  /** Per-field problems. Only present for validation errors. */
  details?: ErrorDetailDto[];

  // The literal type `true` (never `false`) has no plain OpenAPI equivalent,
  // so it's described explicitly.
  @ApiPropertyOptional({
    type: Boolean,
    enum: [true],
    description:
      'Present (always `true`) when more fields failed than are listed in `details`.',
  })
  truncated?: true;
}

export class ErrorResponseDto implements ErrorResponseBody {
  error: ErrorDto;
}
