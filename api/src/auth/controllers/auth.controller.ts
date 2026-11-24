import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { hours, minutes, Throttle } from '@nestjs/throttler';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiAuth,
  ApiDataResponse,
  ApiRateLimited,
} from '@/common/http/api-responses.decorator';
import { NoStore } from '@/common/http/no-store.decorator';
import type { DataResponse } from '@/common/http/responses';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { ThrottleBy } from '../decorators/throttle-by.decorator';
import { AuthResultDto } from '../dto/auth-result.dto';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { RegisterDto } from '../dto/register.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { AuthThrottlerGuard } from '../guards/auth-throttler.guard';
import { AuthService } from '../services/auth.service';
import type { AuthUser } from '../types/auth.types';

// Rate limited: logout gets the module's default (30 per minute).
@ApiTags('auth')
@Controller('auth')
@UseGuards(AuthThrottlerGuard)
@ApiRateLimited()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Creates a customer account and logs it in. */
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: hours(1) } })
  @NoStore()
  @HttpCode(HttpStatus.CREATED)
  @ApiDataResponse(AuthResultDto, { status: HttpStatus.CREATED })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'The email is in use, in any letter case (`EMAIL_TAKEN`). Names may repeat.',
  })
  async register(
    @Body() dto: RegisterDto,
  ): Promise<DataResponse<AuthResultDto>> {
    return { data: await this.auth.register(dto) };
  }

  /** Logs in with the email (names aren't unique); starts a new session. */
  @Public()
  @Post('login')
  // Per IP and email; the 6th try in a minute blocks for 5 minutes.
  @ThrottleBy('email')
  @Throttle({
    default: { limit: 5, ttl: minutes(1), blockDuration: minutes(5) },
  })
  @NoStore()
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AuthResultDto)
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Wrong email or password (`INVALID_CREDENTIALS`); the response does not say which.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'The password is right but the account is blocked (`ACCOUNT_BLOCKED`).',
  })
  async login(@Body() dto: LoginDto): Promise<DataResponse<AuthResultDto>> {
    return { data: await this.auth.login(dto) };
  }

  /**
   * Exchanges a refresh token for a new pair. The token sent is used up:
   * store the new one. Public: the access token has usually expired by now.
   */
  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @NoStore()
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AuthTokensDto)
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Unknown, expired or already used (`INVALID_REFRESH_TOKEN`): log in again. ' +
      'Reusing a used token ends its whole session.',
  })
  async refresh(
    @Body() { refreshToken }: RefreshTokenDto,
  ): Promise<DataResponse<AuthTokensDto>> {
    return { data: await this.auth.refresh(refreshToken) };
  }

  /**
   * Ends the session the refresh token belongs to. Always 204, also for an
   * unknown or expired token. Public: the refresh token proves the session.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'The session has ended, or there was none to end.',
  })
  async logout(@Body() { refreshToken }: RefreshTokenDto): Promise<void> {
    await this.auth.logout(refreshToken);
  }

  /**
   * Changes the password and ends every other session. A notice goes to
   * the account's email.
   */
  @Post('change-password')
  // Per account (see AuthThrottlerGuard): it checks the current password.
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @NoStore()
  @HttpCode(HttpStatus.OK)
  @ApiAuth()
  @ApiDataResponse(AuthResultDto)
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Validation failed, or `currentPassword` is wrong (`WRONG_PASSWORD`).',
  })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<DataResponse<AuthResultDto>> {
    return { data: await this.auth.changePassword(user, dto) };
  }

  /**
   * Emails a link to set a new password (valid for 1 hour), if an active
   * account has this email. Always 204, at once: the answer never says
   * whether the account exists.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  // Per IP and email: caps the emails any one address can be sent.
  @ThrottleBy('email')
  @Throttle({ default: { limit: 3, ttl: hours(1) } })
  @ApiNoContentResponse({
    description:
      'Accepted. If an active account has this email, a reset link is on its way.',
  })
  forgotPassword(@Body() { email }: ForgotPasswordDto): void {
    this.auth.requestPasswordReset(email);
  }

  /**
   * Sets a new password with the token from the reset link. Every session
   * ends; the user then logs in with the new password. A notice goes to the
   * account's email.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: hours(1) } })
  @ApiNoContentResponse({
    description: 'The password is changed and every session has ended.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Validation failed, or the link is unknown, used, expired or replaced ' +
      'by a newer one (`INVALID_TOKEN`): ask for a new one.',
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto);
  }

  /**
   * Marks the email verified with the token from the verification link
   * (valid for 48 hours). No login needed: the link may be opened on
   * another device.
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: hours(1) } })
  @ApiNoContentResponse({ description: 'The email is verified.' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Validation failed, or the link is unknown, used, expired, replaced ' +
      'by a newer one, or for an address the account no longer has ' +
      '(`INVALID_TOKEN`).',
  })
  async verifyEmail(@Body() { token }: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(token);
  }

  /**
   * Emails a new verification link to the caller's address; earlier links
   * stop working. Nothing is sent if the email is already verified.
   */
  @Post('resend-verification')
  // Per account (see AuthThrottlerGuard).
  @Throttle({ default: { limit: 3, ttl: hours(1) } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiNoContentResponse({
    description: 'A link is on its way, unless the email is already verified.',
  })
  async resendVerification(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.resendVerification(user);
  }
}
