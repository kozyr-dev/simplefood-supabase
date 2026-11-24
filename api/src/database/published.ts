import { IsNull, Raw, type FindOperator } from 'typeorm';

/**
 * `where` operator for "published": has a publish date that has passed, by
 * the database clock (one clock for every API instance). No `IS NOT NULL`
 * needed: `NULL <= now()` is not true, so drafts drop out on their own.
 */
export const isPublishedNow = () => Raw((column) => `${column} <= now()`);

/** Where a page or post is, by its `publishedAt` (the admin shows and filters by it). */
export enum PublishState {
  /** No publish date. */
  Draft = 'draft',
  /** A date still to come. */
  Scheduled = 'scheduled',
  /** A date that has passed: the site shows it. */
  Published = 'published',
}

export function publishStateOf(
  publishedAt: Date | null,
  now = new Date(),
): PublishState {
  if (!publishedAt) return PublishState.Draft;
  return publishedAt <= now ? PublishState.Published : PublishState.Scheduled;
}

/** `where` operator for `publishedAt` in this state (database clock). */
export function inPublishState(state: PublishState): FindOperator<Date> {
  switch (state) {
    case PublishState.Draft:
      return IsNull();
    case PublishState.Scheduled:
      return Raw((column) => `${column} > now()`);
    case PublishState.Published:
      return isPublishedNow();
  }
}
