import { BadRequestException } from '@nestjs/common';
import { In, type FindOptionsWhere, type Repository } from 'typeorm';

/** A 400 for a field that names a record that doesn't exist. */
export function invalidReference(field: string): BadRequestException {
  return new BadRequestException({
    message: 'Validation failed',
    details: [
      { field, messages: [`${field} refers to a record that doesn't exist`] },
    ],
  });
}

/**
 * The rows with these ids, in the order given; a 400 naming `field` when
 * any is missing. Duplicates count once.
 */
export async function loadReferences<T extends { id: string }>(
  repository: Repository<T>,
  ids: readonly string[],
  field: string,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const rows = await repository.findBy({
    id: In(unique),
  } as FindOptionsWhere<T>);
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== unique.length) throw invalidReference(field);
  return unique.map((id) => byId.get(id) as T);
}

/**
 * For an optional reference in an update: `undefined` (not sent) stays
 * `undefined`, `null` clears it, an id must exist (400 otherwise).
 */
export async function loadReference<T extends { id: string }>(
  repository: Repository<T>,
  id: string | null | undefined,
  field: string,
): Promise<T | null | undefined> {
  if (id === undefined || id === null) return id;
  const [row] = await loadReferences(repository, [id], field);
  return row;
}
