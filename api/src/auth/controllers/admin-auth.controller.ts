import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiDataResponse,
  ApiRateLimited,
} from '@/common/http/api-responses.decorator';
import {
  expiredCookie,
  readCookie,
  serializeCookie,
  type CookieOptions,
} from '@/common/http/cookies';
import { NoStore } from '@/common/http/no-store.decorator';
import type { DataResponse } from '@/common/http/responses';
import { Public } from '../decorators/public.decorator';
import { ThrottleBy } from '../decorators/throttle-by.decorator';
import { AdminSessionDto } from '../dto/admin-session.dto';
import type { AuthResultDto } from '../dto/auth-result.dto';
import { LoginDto } from '../dto/login.dto';
import { AuthThrottlerGuard } from '../guards/auth-throttler.guard';
import { SameOriginGuard } from '../guards/same-origin.guard';
import { AuthService } from '../services/auth.service';
import { invalidRefreshToken } from '../services/refresh-tokens.service';
import {
  ADMIN_REFRESH_COOKIE,
  ADMIN_REFRESH_COOKIE_PATH,
  ADMIN_REFRESH_SECURITY,
} from '../types/auth.types';

const CROSS_ORIGIN = {
  type: ErrorResponseDto,
  description:
    "Not sent from a page on the API's own host (`CROSS_ORIGIN_REQUEST`).",
};

/**
 * Sessions for the admin app (served at /admin, from the API's own host).
 * The same accounts, passwords, rotation and reuse detection as /auth, but
 * staff only, and the refresh token lives in an `HttpOnly`,
 * `SameSite=Strict` cookie scoped to these routes instead of in the body:
 * page scripts, and so an XSS bug, can never read it. The access token is
 * kept in the app's memory and sent as a bearer token, as everywhere else.
 *
 * Every request must come from the API's own host (SameOriginGuard). Rate
 * limits match /auth's; the counters are separate.
 */
@ApiTags('admin')
// ADMIN_REFRESH_COOKIE_PATH must stay in step with this path.
@Controller('admin/auth')
// Origin first: a cross-site request doesn't count towards anyone's limit.
@UseGuards(SameOriginGuard, AuthThrottlerGuard)
@ApiRateLimited()
@ApiForbiddenResponse(CROSS_ORIGIN)
export class AdminAuthController {
  private readonly cookie: Omit<CookieOptions, 'expires'>;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.cookie = {
      path: ADMIN_REFRESH_COOKIE_PATH,
      httpOnly: true,
      // Local development runs over http; browsers drop Secure cookies there.
      secure: config.getOrThrow<string>('NODE_ENV') === 'production',
      sameSite: 'Strict',
    };
  }

  /** Logs a staff member in: the access token here, the refresh token in the cookie. */
  @Public()
  @Post('login')
  // As /auth/login: per IP and email, the 6th try in a minute blocks for 5.
  @ThrottleBy('email')
  @Throttle({
    default: { limit: 5, ttl: minutes(1), blockDuration: minutes(5) },
  })
  @NoStore()
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AdminSessionDto)
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Wrong email or password (`INVALID_CREDENTIALS`); the response does not say which.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'The password is right but the account is blocked (`ACCOUNT_BLOCKED`) ' +
      'or a customer (`NOT_STAFF`); or the request came from another site ' +
      '(`CROSS_ORIGIN_REQUEST`).',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<DataResponse<AdminSessionDto>> {
    return { data: this.startSession(res, await this.auth.staffLogin(dto)) };
  }

  /**
   * A new access token for the session in the cookie, which is replaced.
   * Also the way back in after a page reload: the app keeps nothing.
   */
  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @NoStore()
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(ADMIN_REFRESH_SECURITY)
  @ApiDataResponse(AdminSessionDto)
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'No cookie, or its token is unknown, expired or already used ' +
      '(`INVALID_REFRESH_TOKEN`): log in again. The cookie is deleted.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'The account is no longer staff (`NOT_STAFF`): the session ends and ' +
      'the cookie is deleted. Or the request came from another site ' +
      '(`CROSS_ORIGIN_REQUEST`).',
  })
  async refresh(
    @Req() req: IncomingMessage,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<DataResponse<AdminSessionDto>> {
    const token = readCookie(req.headers.cookie, ADMIN_REFRESH_COOKIE);
    try {
      if (!token) {
        throw invalidRefreshToken();
      }
      return {
        data: this.startSession(res, await this.auth.staffRefresh(token)),
      };
    } catch (error) {
      // A token that failed once never works again: don't keep sending it.
      this.endSession(res);
      throw error;
    }
  }

  /** Ends the cookie's session and deletes the cookie. Always 204. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(ADMIN_REFRESH_SECURITY)
  @ApiNoContentResponse({
    description: 'The session has ended, or there was none to end.',
  })
  async logout(
    @Req() req: IncomingMessage,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<void> {
    const token = readCookie(req.headers.cookie, ADMIN_REFRESH_COOKIE);
    if (token) {
      await this.auth.logout(token);
    }
    this.endSession(res);
  }

  /** Puts the refresh token in the cookie; the rest goes in the body. */
  private startSession(
    res: ServerResponse,
    { refreshToken, refreshTokenExpiresAt, ...session }: AuthResultDto,
  ): AdminSessionDto {
    res.setHeader(
      'Set-Cookie',
      serializeCookie(ADMIN_REFRESH_COOKIE, refreshToken, {
        ...this.cookie,
        expires: refreshTokenExpiresAt,
      }),
    );
    return session;
  }

  private endSession(res: ServerResponse): void {
    res.setHeader(
      'Set-Cookie',
      expiredCookie(ADMIN_REFRESH_COOKIE, this.cookie),
    );
  }
}
