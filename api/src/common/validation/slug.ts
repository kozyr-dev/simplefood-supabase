import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * A URL slug: lower-case Latin letters and digits, words joined by single
 * hyphens (`borscht-with-sour-cream`). Every imported slug fits.
 */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A slug of at most `maxLength` characters (the column's length). */
export function IsSlug(maxLength: number): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MaxLength(maxLength),
    Matches(SLUG, {
      message:
        '$property must be lower-case letters and digits, joined by single hyphens',
    }),
  );
}
