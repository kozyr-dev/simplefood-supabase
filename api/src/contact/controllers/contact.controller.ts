import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { hours, Throttle } from '@nestjs/throttler';
import { Public } from '@/auth/decorators/public.decorator';
import { ThrottleBy } from '@/auth/decorators/throttle-by.decorator';
import { AuthThrottlerGuard } from '@/auth/guards/auth-throttler.guard';
import { ApiRateLimited } from '@/common/http/api-responses.decorator';
import { CreateContactDto } from '../dto/create-contact.dto';
import { ContactService } from '../services/contact.service';

@ApiTags('contact')
@Public()
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /**
   * Sends a message to the shop. It's saved, and the shop gets an email it
   * can reply to.
   */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  // Per IP and sender email: caps what one address can trigger even while
  // every visitor arrives from the Next server's IP.
  @UseGuards(AuthThrottlerGuard)
  @ThrottleBy('email')
  @Throttle({ default: { limit: 5, ttl: hours(1) } })
  @ApiNoContentResponse({ description: 'The message was received.' })
  @ApiRateLimited()
  async submit(@Body() dto: CreateContactDto): Promise<void> {
    await this.contact.submit(dto);
  }
}
