import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiResponse,
  ApiSecurity,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../filters/error-response.dto';
import { PaginationMetaDto } from './pagination-meta.dto';

/*
 * TypeScript erases generic types at runtime, so Swagger can't see what's
 * inside `Paginated<ProductDto>` or `DataResponse<ProductDto>`. These
 * decorators describe the envelope by hand, as the Nest docs recommend.
 */

/** Documents `{ data: Model[], meta: PaginationMetaDto }` as the 200 response. */
export function ApiPaginatedResponse(model: Type) {
  return applyDecorators(
    ApiExtraModels(PaginationMetaDto, model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    }),
  );
}

/**
 * Documents `{ data: Model }`, or `{ data: Model[] }` with `isArray`, as the
 * 200 response (or `status`, e.g. 201 for a route that creates).
 */
export function ApiDataResponse(
  model: Type,
  {
    isArray = false,
    status = HttpStatus.OK,
  }: { isArray?: boolean; status?: HttpStatus } = {},
) {
  const item = { $ref: getSchemaPath(model) };
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      schema: {
        type: 'object',
        required: ['data'],
        properties: {
          data: isArray ? { type: 'array', items: item } : item,
        },
      },
    }),
  );
}

/**
 * A route that needs a login: the bearer scheme (Swagger UI's Authorize
 * button) and the 401 JwtAuthGuard sends. With `roles` (as given to
 * `@Roles()`), also the 403 RolesGuard sends to everyone else.
 */
export function ApiAuth({ roles }: { roles?: readonly string[] } = {}) {
  return applyDecorators(
    ApiBearerAuth(),
    ...(roles ? [ApiRolesForbidden(roles)] : []),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description:
        'No access token, or it is invalid or expired: refresh and retry. ' +
        'Also when the account was blocked or deleted since the token was issued.',
      headers: {
        'WWW-Authenticate': {
          description:
            '`Bearer`, or `Bearer error="invalid_token"` when a token was sent.',
          schema: { type: 'string' },
        },
      },
    }),
  );
}

/**
 * The 403 RolesGuard sends to other roles. Part of `ApiAuth({ roles })`;
 * alone on a method whose `@Roles()` narrows its controller's.
 */
export function ApiRolesForbidden(roles: readonly string[]) {
  return ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: `Logged in, but not as ${roles.join(' or ')} (\`FORBIDDEN\`).`,
  });
}

/**
 * An `@OptionalAuth()` route: callable without a token (`{}` in the security
 * list) or with one, and the 401 for a token that is sent but invalid.
 */
export function ApiOptionalAuth() {
  return applyDecorators(
    ApiSecurity({}),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description:
        'A token was sent but is invalid or expired: refresh and retry ' +
        '(sending none is fine). Also when the account was blocked or ' +
        'deleted since the token was issued.',
      headers: {
        'WWW-Authenticate': {
          description:
            '`Bearer error="invalid_token"`, or `Bearer` for a malformed header.',
          schema: { type: 'string' },
        },
      },
    }),
  );
}

/** A route behind AuthThrottlerGuard: the 429 it sends past its limit. */
export function ApiRateLimited() {
  return ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Too many requests (`TOO_MANY_REQUESTS`).',
    headers: {
      'Retry-After': {
        description: 'Seconds until the limit resets.',
        schema: { type: 'integer' },
      },
    },
  });
}
