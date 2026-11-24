import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

/** Values of these keys reach the app byte-for-byte: a space can be part of a password. */
const UNTRIMMED_KEY = /password/i;

/**
 * Trims leading/trailing whitespace from every string in the request body and
 * query, recursively (nested objects and arrays). Registered before
 * ValidationPipe, so validators see the trimmed values.
 */
@Injectable()
export class TrimPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body' && metadata.type !== 'query') {
      return value;
    }
    // `metadata.data` is set for `@Body('email')`-style params.
    return trimDeep(value, metadata.data);
  }
}

function trimDeep(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    return key && UNTRIMMED_KEY.test(key) ? value : value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => trimDeep(item, key));
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    for (const [entryKey, entryValue] of Object.entries(record)) {
      // Assigning to `__proto__` would replace the object's prototype.
      if (entryKey === '__proto__') continue;
      record[entryKey] = trimDeep(entryValue, entryKey);
    }
  }
  return value;
}
