import { Header } from '@nestjs/common';

/**
 * `Cache-Control: no-store`: no browser or proxy may keep a copy. For
 * responses carrying tokens (RFC 6749 §5.1 requires it for token responses)
 * or personal data. Nest sets it once the guards pass, so it's on successes
 * and on the route's own errors, but not on a guard's 401/403 (no data there).
 */
export const NoStore = () => Header('Cache-Control', 'no-store');
