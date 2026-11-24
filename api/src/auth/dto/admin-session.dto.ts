import { PickType } from '@nestjs/swagger';
import { AuthResultDto } from './auth-result.dto';

/**
 * The admin app's login and refresh: the access token and the account. The
 * refresh token is not here: it travels in the `sf_admin_refresh` cookie,
 * out of reach of page scripts.
 */
export class AdminSessionDto extends PickType(AuthResultDto, [
  'accessToken',
  'expiresIn',
  'user',
] as const) {}
