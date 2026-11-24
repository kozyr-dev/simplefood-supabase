import { UserDto } from '@/users/dto/user.dto';
import { AuthTokensDto } from './auth-tokens.dto';

/** Login, registration and password change: the tokens plus the account. */
export class AuthResultDto extends AuthTokensDto {
  user: UserDto;
}
