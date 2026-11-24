/**
 * Whether two addresses are the same to the database: the email columns are
 * citext, which compares them regardless of letter case.
 */
export function sameEmail(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
