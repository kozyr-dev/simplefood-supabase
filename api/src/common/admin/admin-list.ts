import { ConflictException } from '@nestjs/common';
import { ILike, QueryFailedError, type FindOperator } from 'typeorm';
import type { SortOrder } from './admin-list-query.dto';

/**
 * TypeORM `order` for an admin list: the chosen column, then `id` in the
 * same direction, so rows with equal values never swap between pages.
 */
export function adminOrder(
  sort: string,
  order: SortOrder,
): Record<string, SortOrder> {
  return sort === 'id' ? { id: order } : { [sort]: order, id: order };
}

/**
 * `ILIKE '%text%'`, with the text matched literally: `%`, `_` and `\` in a
 * search are characters, not wildcards (Postgres escapes with `\`).
 */
export function contains(text: string): FindOperator<string> {
  return ILike(`%${text.replace(/[\\%_]/g, '\\$&')}%`);
}

/** For a unique constraint: the field it guards, and the error code. */
export interface UniqueField {
  field: string;
  code: string;
}

/**
 * A 409 with a field error the admin app shows next to the input, for a
 * duplicate on one of `constraints`; null for any other error.
 */
export function uniqueViolation(
  error: unknown,
  constraints: Record<string, UniqueField>,
): ConflictException | null {
  if (!(error instanceof QueryFailedError)) return null;
  const { code, constraint } = error.driverError as {
    code?: string;
    constraint?: string;
  };
  const unique = code === '23505' ? constraints[constraint ?? ''] : undefined;
  if (!unique) return null;
  return new ConflictException({
    message: `This ${unique.field} is already in use`,
    code: unique.code,
    details: [
      { field: unique.field, messages: [`${unique.field} is already in use`] },
    ],
  });
}
