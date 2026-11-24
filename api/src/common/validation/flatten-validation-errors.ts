import { ValidationError } from 'class-validator';

export interface ValidationErrorDetail {
  /** Dotted path to the field, e.g. `email` or `items.0.quantity`. */
  field: string;
  messages: string[];
}

export interface FlattenedValidationErrors {
  details: ValidationErrorDetail[];
  /** True when more fields failed than `limit`; the rest are left out. */
  truncated: boolean;
}

/**
 * Upper bound on reported fields. A custom `exceptionFactory` bypasses
 * ValidationPipe's own `maxErrorMessagesLength` budget, so without a cap a
 * body with thousands of invalid array items would yield a huge response.
 */
export const MAX_VALIDATION_DETAILS = 100;

/**
 * Turns class-validator's error tree (nested objects and arrays live in
 * `children`) into a flat list with dotted field paths.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  limit = MAX_VALIDATION_DETAILS,
): FlattenedValidationErrors {
  const details: ValidationErrorDetail[] = [];
  let truncated = false;

  const visit = (nodes: ValidationError[], parentPath: string): void => {
    for (const node of nodes) {
      if (truncated) return;
      const field = parentPath
        ? `${parentPath}.${node.property}`
        : node.property;

      if (node.constraints) {
        if (details.length >= limit) {
          truncated = true;
          return;
        }
        details.push({ field, messages: Object.values(node.constraints) });
      }
      if (node.children?.length) {
        visit(node.children, field);
      }
    }
  };

  visit(errors, '');
  return { details, truncated };
}
