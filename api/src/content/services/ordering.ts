import { BadRequestException } from '@nestjs/common';
import type {
  FindOptionsOrder,
  FindOptionsSelect,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

/**
 * Sets `position` 0, 1, 2... in the order of `ids`, for the rows matching
 * `scope` (a page's sections, a menu group's items). `ids` must be exactly
 * those rows: one missing or foreign is a 400 `ORDER_MISMATCH` (the list
 * changed since the client loaded it). Run it in a transaction.
 */
export async function applyOrder<T extends { id: string; position: number }>(
  repository: Repository<T>,
  ids: readonly string[],
  scope: FindOptionsWhere<T>,
): Promise<void> {
  const rows = await repository.find({
    select: { id: true } as FindOptionsSelect<T>,
    where: scope,
    // Rows lock in a fixed order: two reorders of one list can't deadlock.
    order: { id: 'ASC' } as FindOptionsOrder<T>,
    lock: { mode: 'pessimistic_write' },
  });
  const current = new Set(rows.map((row) => row.id));
  if (current.size !== ids.length || !ids.every((id) => current.has(id))) {
    throw new BadRequestException({
      message: 'The list has changed; reload it and try again',
      code: 'ORDER_MISMATCH',
    });
  }
  for (const [position, id] of ids.entries()) {
    // TypeORM can't see that every T has `position`; the bound says it does.
    const change = { position } as unknown as QueryDeepPartialEntity<T>;
    await repository.update(id, change);
  }
}
