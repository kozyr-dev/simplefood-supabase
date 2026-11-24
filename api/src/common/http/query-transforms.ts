import { Transform } from 'class-transformer';

/**
 * Parses a boolean query parameter. Query values are strings, and
 * `@Type(() => Boolean)` would turn the non-empty string "false" into `true`.
 *
 * `'true'` -> true, `'false'` -> false; anything else is passed through
 * unchanged, so pair it with `@IsBoolean()` to reject e.g. `?featured=yes`.
 */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });
}
